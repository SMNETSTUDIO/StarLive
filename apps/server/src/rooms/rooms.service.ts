import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { ErrorCode, Keys, type Room } from "@starlive/shared";
import { genId } from "../common/audit";
import { BizException } from "../common/errors";
import { redis, redisPipeline } from "../common/redis";
import {
  bindStreamKey,
  countViewers,
  getRoom,
  heartbeatViewer,
  setRoomField,
  setRoomStatus,
} from "../common/room-store";
import { StreamService } from "../stream/stream.service";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function hashPassword(pwd: string): string {
  return createHash("sha256").update(pwd).digest("hex");
}

@Injectable()
export class RoomsService {
  constructor(private readonly stream: StreamService) {}

  async create(
    userId: string,
    input: {
      title: string;
      customRoomId?: string;
      announcement?: string;
      isPublic?: boolean;
      password?: string;
      category?: string;
      tags?: string[];
    },
  ) {
    const title = (input.title ?? "").trim();
    if (!title) throw new BizException(ErrorCode.INVALID_AMOUNT, "请输入房间标题");

    let roomId = input.customRoomId ? slugify(input.customRoomId) : genId("room_");
    if (!roomId) roomId = genId("room_");
    if (await getRoom(roomId)) roomId = `${roomId}_${randomBytes(3).toString("hex")}`;

    const streamInfo = await this.stream.createStream({ title, roomId });
    const now = Date.now();
    const room: Record<string, string> = {
      id: roomId,
      title,
      announcement: input.announcement ?? "",
      ownerId: userId,
      isPublic: input.isPublic === false ? "false" : "true",
      category: input.category ?? "",
      tags: JSON.stringify(input.tags ?? []),
      status: "idle",
      streamId: streamInfo.streamId,
      streamKey: streamInfo.streamKey,
      playbackId: streamInfo.playbackId,
      playbackUrl: streamInfo.playbackUrl ?? "",
      provider: this.stream.provider.name,
      banned: "false",
      createdAt: String(now),
    };
    if (input.password) room.passwordHash = hashPassword(input.password);

    const r = redis();
    await redisPipeline((p) => {
      p.hset(Keys.room(roomId), room);
      p.sadd(Keys.roomsSet, roomId);
      p.sadd(Keys.userRooms(userId), roomId);
      if (room.isPublic === "true") p.sadd(Keys.publicRoomsSet, roomId);
      if (room.category) p.sadd(Keys.categoryRooms(room.category), roomId);
    });
    await bindStreamKey(streamInfo.streamKey, roomId);

    return { id: roomId, ...this.sanitize(room) };
  }

  async get(roomId: string, viewer: { userId?: string }, password?: string) {
    const room = await getRoom(roomId);
    if (!room) throw new BizException(ErrorCode.NOT_FOUND, "房间不存在");
    if (room.banned) throw new BizException(ErrorCode.ROOM_BANNED, "房间已被封禁", 403);

    const isOwner = viewer.userId === room.ownerId;
    const isAdmin = viewer.userId ? await this.isAdmin(viewer.userId) : false;

    if (room.passwordHash && !isOwner && !isAdmin) {
      if (!password) {
        throw new BizException(ErrorCode.ROOM_PASSWORD_REQUIRED, "需要密码");
      }
      if (hashPassword(password) !== room.passwordHash) {
        throw new BizException(ErrorCode.ROOM_PASSWORD_WRONG, "密码错误");
      }
    }

    const counts = await countViewers(roomId);

    // 实时同步推流状态（自建 MediaMTX 通过 API 轮询，带缓存降级）
    let status = room.status;
    if (room.streamId && this.stream.provider.name === "selfhosted") {
      try {
        status = (await this.stream.getStream(room.streamId)).status;
        if (status !== room.status) await setRoomStatus(roomId, status);
      } catch {
        status = room.status;
      }
    }

    const result: Record<string, unknown> = { ...room, status, ...counts };
    if (!isOwner && !isAdmin) {
      delete result.streamKey;
      delete result.streamId;
    }
    delete result.passwordHash;
    return result;
  }

  async list(opts: { userId?: string; mine?: boolean; publicOnly?: boolean; category?: string }) {
    const r = redis();
    let ids: string[];

    if (opts.mine && opts.userId) {
      ids = await r.smembers(Keys.userRooms(opts.userId));
    } else if (opts.category) {
      ids = await r.smembers(Keys.categoryRooms(opts.category));
    } else {
      ids = await r.smembers(Keys.publicRoomsSet);
    }

    if (ids.length === 0) return [];

    const rows = await redisPipeline<string[]>((p) => {
      for (const id of ids) p.hmget(Keys.room(id), "id", "title", "ownerId", "isPublic", "category", "status", "announcement", "playbackUrl", "banned", "createdAt", "streamId");
    });

    const rooms = rows
      .map((r, i) => ({
        id: r[0],
        title: r[1],
        ownerId: r[2],
        isPublic: r[3] === "true",
        category: r[4],
        status: r[5],
        announcement: r[6],
        playbackUrl: r[7],
        banned: r[8] === "true",
        createdAt: Number(r[9] ?? 0),
        streamId: r[10],
        _roomId: ids[i],
      }))
      .filter((rm) => !rm.banned && (opts.mine || rm.isPublic || rm.status === "active"));

    const out: Array<Record<string, unknown>> = [];
    for (const rm of rooms) {
      // 仅对已开播房间刷新真实推流状态（带缓存，成本可控）
      if (rm.streamId && rm.status === "active" && this.stream.provider.name === "selfhosted") {
        try {
          rm.status = (await this.stream.getStream(rm.streamId)).status;
          if (rm.status !== "active") await setRoomStatus(rm._roomId, rm.status as "idle" | "active");
        } catch {
          /* keep */
        }
      }
      const counts = await countViewers(rm._roomId);
      const { _roomId: _x, ...rest } = rm;
      void _x;
      out.push({ ...rest, ...counts });
    }
    return out;
  }

  async update(
    roomId: string,
    userId: string,
    input: { title?: string; isPublic?: boolean },
  ) {
    const room = await this.requireOwnership(roomId, userId);
    if (input.title !== undefined) {
      await setRoomField(roomId, "title", input.title);
    }
    if (input.isPublic !== undefined) {
      const pub = input.isPublic;
      await setRoomField(roomId, "isPublic", pub ? "true" : "false");
      const r = redis();
      if (pub) await r.sadd(Keys.publicRoomsSet, roomId);
      else await r.srem(Keys.publicRoomsSet, roomId);
    }
    return { ok: true, ...room };
  }

  async updateTags(roomId: string, userId: string, input: { category?: string; tags?: string[] }) {
    await this.requireOwnership(roomId, userId);
    if (input.category !== undefined) {
      await setRoomField(roomId, "category", input.category);
      await redis().sadd(Keys.categoryRooms(input.category), roomId);
    }
    if (input.tags !== undefined) {
      await setRoomField(roomId, "tags", JSON.stringify(input.tags));
    }
    return { ok: true };
  }

  async updateAnnouncement(roomId: string, userId: string, announcement: string) {
    await this.requireOwnership(roomId, userId);
    await setRoomField(roomId, "announcement", announcement ?? "");
    return { ok: true };
  }

  async remove(roomId: string, userId: string) {
    const room = await this.requireOwnership(roomId, userId);
    if (room.streamKey) await this.stream.deleteStream(room.streamId ?? room.streamKey);
    const r = redis();
    await redisPipeline((p) => {
      p.del(Keys.room(roomId));
      p.srem(Keys.roomsSet, roomId);
      p.srem(Keys.publicRoomsSet, roomId);
      p.srem(Keys.userRooms(room.ownerId), roomId);
      if (room.category) p.srem(Keys.categoryRooms(room.category), roomId);
    });
    return { ok: true };
  }

  async heartbeat(
    roomId: string,
    identity: { userId?: string; guestId?: string },
  ) {
    return heartbeatViewer(roomId, identity);
  }

  async setStatus(roomId: string, status: "idle" | "connected" | "active") {
    const { setRoomStatus } = await import("../common/room-store");
    await setRoomStatus(roomId, status);
    return { ok: true };
  }

  private async requireOwnership(roomId: string, userId: string): Promise<Room> {
    const room = await getRoom(roomId);
    if (!room) throw new BizException(ErrorCode.NOT_FOUND, "房间不存在");
    const isAdmin = await this.isAdmin(userId);
    if (room.ownerId !== userId && !isAdmin) {
      throw new BizException(ErrorCode.FORBIDDEN, "无权限", 403);
    }
    return room;
  }

  private async isAdmin(userId: string): Promise<boolean> {
    const { resolveAdmin } = await import("../common/admin");
    const a = await resolveAdmin(userId);
    return a.isSuperAdmin || a.permissions.includes("rooms.*") || a.permissions.includes("*");
  }

  private sanitize(room: Record<string, string>) {
    const { passwordHash: _p, ...rest } = room;
    void _p;
    return rest;
  }
}
