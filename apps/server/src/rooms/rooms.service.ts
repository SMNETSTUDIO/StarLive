import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { ErrorCode, Keys, type Room } from "@starlive/shared";
import { genId } from "../common/audit";
import { cached, invalidateCache } from "../common/cache";
import { BizException } from "../common/errors";
import { redis, redisPipeline } from "../common/redis";
import {
  bindStreamKey,
  countViewers,
  countViewersBatch,
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

    const provider = await this.stream.getProvider();
    const streamInfo = await provider.createStream({ title, roomId });
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
      provider: provider.name,
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
    invalidateCache("rooms:list:");

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

    // 实时同步推流状态（按房间创建时的 Provider 轮询，带缓存降级）
    let status = room.status;
    if (room.streamId) {
      try {
        status = (await this.stream.getStream(room.streamId, room.provider)).status;
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
    // 公开列表（直播广场/首页高频轮询）走 3s 进程内缓存，Redis 压力与首屏延迟都大幅下降
    if (!opts.mine) {
      return cached(`rooms:list:${opts.category ?? ""}`, 3000, () => this.buildList(opts));
    }
    return this.buildList(opts);
  }

  private async buildList(opts: {
    userId?: string;
    mine?: boolean;
    publicOnly?: boolean;
    category?: string;
  }) {
    const r = redis();
    let ids: string[];

    if (opts.mine) {
      // mine 必须有登录身份；未登录返回空，不回退到公开列表
      ids = opts.userId ? await r.smembers(Keys.userRooms(opts.userId)) : [];
    } else if (opts.category) {
      ids = await r.smembers(Keys.categoryRooms(opts.category));
    } else {
      ids = await r.smembers(Keys.publicRoomsSet);
    }

    if (ids.length === 0) return [];

    const rows = await redisPipeline<string[]>((p) => {
      for (const id of ids) p.hmget(Keys.room(id), "id", "title", "ownerId", "isPublic", "category", "status", "announcement", "playbackUrl", "banned", "createdAt", "streamId", "provider");
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
        provider: r[11] ?? undefined,
        _roomId: ids[i],
      }))
      .filter((rm) => !rm.banned && (opts.mine || rm.isPublic || rm.status === "active"));

    // 推流状态并发刷新（各自带 5s 内存缓存）+ 在线人数一次 pipeline 批量取
    const [countsMap] = await Promise.all([
      countViewersBatch(rooms.map((rm) => rm._roomId)),
      Promise.all(
        rooms
          .filter((rm) => rm.streamId && rm.status === "active")
          .map(async (rm) => {
            try {
              rm.status = (await this.stream.getStream(rm.streamId!, rm.provider)).status;
              if (rm.status !== "active") {
                await setRoomStatus(rm._roomId, rm.status as "idle" | "active");
              }
            } catch {
              /* keep */
            }
          }),
      ),
    ]);

    return rooms.map((rm) => {
      const { _roomId, ...rest } = rm;
      return { ...rest, ...(countsMap.get(_roomId) ?? { viewerCount: 0, registeredCount: 0, guestCount: 0 }) };
    });
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
    invalidateCache("rooms:list:");
    return { ok: true, ...room };
  }

  async updateTags(roomId: string, userId: string, input: { category?: string; tags?: string[] }) {
    const room = await this.requireOwnership(roomId, userId);
    if (input.category !== undefined) {
      // 换分类时先从旧分类索引移除，避免残留
      if (room.category && room.category !== input.category) {
        await redis().srem(Keys.categoryRooms(room.category), roomId);
      }
      await setRoomField(roomId, "category", input.category);
      if (input.category) await redis().sadd(Keys.categoryRooms(input.category), roomId);
    }
    if (input.tags !== undefined) {
      await setRoomField(roomId, "tags", JSON.stringify(input.tags));
    }
    invalidateCache("rooms:list:");
    return { ok: true };
  }

  async updateAnnouncement(roomId: string, userId: string, announcement: string) {
    await this.requireOwnership(roomId, userId);
    await setRoomField(roomId, "announcement", announcement ?? "");
    return { ok: true };
  }

  /**
   * 重置推流：把房间迁移到当前全局配置的直播流服务。
   * 重新生成推流密钥与播放地址（OBS 需更新配置），直播中不可操作。
   */
  async resetStream(roomId: string, userId: string) {
    const room = await this.requireOwnership(roomId, userId);
    if (room.status === "active") {
      throw new BizException(ErrorCode.INVALID_AMOUNT, "直播进行中，请先停止推流再重置");
    }

    const provider = await this.stream.getProvider();
    const info = await provider.createStream({ title: room.title, roomId });

    // 新流建好后再清旧流与旧密钥映射（失败不阻断迁移）
    if (room.streamKey) {
      try {
        await this.stream.deleteStream(room.streamId ?? room.streamKey, room.provider);
      } catch {
        /* ignore */
      }
      await redis().del(`stream:key:${room.streamKey}`);
    }

    await redisPipeline((p) => {
      p.hset(Keys.room(roomId), {
        streamId: info.streamId,
        streamKey: info.streamKey,
        playbackId: info.playbackId,
        playbackUrl: info.playbackUrl ?? "",
        provider: provider.name,
        status: "idle",
      });
    });
    await bindStreamKey(info.streamKey, roomId);

    return {
      ok: true,
      provider: provider.name,
      streamKey: info.streamKey,
      playbackUrl: info.playbackUrl ?? "",
    };
  }

  async remove(roomId: string, userId: string) {
    const room = await this.requireOwnership(roomId, userId);
    if (room.streamKey) await this.stream.deleteStream(room.streamId ?? room.streamKey, room.provider);
    const r = redis();
    await redisPipeline((p) => {
      p.del(Keys.room(roomId));
      p.srem(Keys.roomsSet, roomId);
      p.srem(Keys.publicRoomsSet, roomId);
      p.srem(Keys.userRooms(room.ownerId), roomId);
      if (room.category) p.srem(Keys.categoryRooms(room.category), roomId);
    });
    invalidateCache("rooms:list:");
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

  /** 在线观众名单（注册用户，最多 30 人）+ 游客数 */
  async onlineViewers(roomId: string) {
    const { VIEWER_TTL_MS } = await import("../common/room-store");
    const { getUserById } = await import("../common/user-store");
    const r = redis();
    const min = Date.now() - VIEWER_TTL_MS;
    const ids = await r.zrangebyscore(Keys.roomViewersUser(roomId), min, "+inf", "LIMIT", 0, 30);
    const users: { id: string; name: string; avatarUrl?: string }[] = [];
    for (const id of ids) {
      const u = await getUserById(id);
      if (u) users.push({ id: u.id, name: u.name ?? u.username, avatarUrl: u.avatarUrl });
    }
    const guestCount = await r.zcount(Keys.roomViewersGuest(roomId), min, "+inf");
    return { users, guestCount };
  }

  /** 关注主播 */
  async follow(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BizException(ErrorCode.INVALID_AMOUNT, "不能关注自己");
    }
    const { getUserById } = await import("../common/user-store");
    const target = await getUserById(targetUserId);
    if (!target) throw new BizException(ErrorCode.NOT_FOUND, "用户不存在", 404);
    await redisPipeline((p) => {
      p.sadd(Keys.userFollowing(userId), targetUserId);
      p.sadd(Keys.userFollowers(targetUserId), userId);
    });
    return this.followStatus(userId, targetUserId);
  }

  /** 取消关注 */
  async unfollow(userId: string, targetUserId: string) {
    await redisPipeline((p) => {
      p.srem(Keys.userFollowing(userId), targetUserId);
      p.srem(Keys.userFollowers(targetUserId), userId);
    });
    return this.followStatus(userId, targetUserId);
  }

  /** 关注状态：粉丝数 + 我是否已关注 */
  async followStatus(userId: string | undefined, targetUserId: string) {
    const r = redis();
    const followers = await r.scard(Keys.userFollowers(targetUserId));
    const following = userId
      ? (await r.sismember(Keys.userFollowing(userId), targetUserId)) === 1
      : false;
    return { followers, following };
  }

  /** 公开用户主页：基本资料 + 关注数据 + 公开直播间列表 */
  async publicProfile(viewerId: string | undefined, targetUserId: string) {
    const { getUserById } = await import("../common/user-store");
    const u = await getUserById(targetUserId);
    if (!u || u.banned === "true") {
      throw new BizException(ErrorCode.NOT_FOUND, "用户不存在", 404);
    }
    const r = redis();
    const [{ followers, following }, followingCount, roomIds] = await Promise.all([
      this.followStatus(viewerId, targetUserId),
      r.scard(Keys.userFollowing(targetUserId)),
      r.smembers(Keys.userRooms(targetUserId)),
    ]);

    // 并发取房间详情（autoPipelining 合并往返）+ 批量在线人数
    const details = await Promise.all(roomIds.map((id) => getRoom(id)));
    const visible = details.filter((rm): rm is NonNullable<typeof rm> => Boolean(rm && !rm.banned && rm.isPublic));
    const countsMap = await countViewersBatch(visible.map((rm) => rm.id));
    const rooms: Array<Record<string, unknown>> = visible.map((room) => ({
      id: room.id,
      title: room.title,
      announcement: room.announcement,
      category: room.category,
      tags: room.tags,
      status: room.status,
      playbackUrl: room.playbackUrl,
      createdAt: room.createdAt,
      ...(countsMap.get(room.id) ?? { viewerCount: 0, registeredCount: 0, guestCount: 0 }),
    }));
    // 开播的排前面
    rooms.sort((a, b) => Number(b.status === "active") - Number(a.status === "active"));

    return {
      user: {
        id: u.id,
        name: u.name ?? u.username,
        username: u.username,
        avatarUrl: u.avatarUrl,
        createdAt: Number(u.createdAt ?? 0),
      },
      followers,
      following,
      followingCount,
      rooms,
    };
  }

  /** 我关注的主播列表（含直播间与开播状态） */
  async followingList(userId: string) {
    const ids = await redis().smembers(Keys.userFollowing(userId));
    if (ids.length === 0) return [];
    const { getUserById } = await import("../common/user-store");
    const result: {
      userId: string;
      name: string;
      avatarUrl?: string;
      roomId?: string;
      live: boolean;
    }[] = [];
    for (const id of ids) {
      const u = await getUserById(id);
      if (!u) continue;
      const roomIds = await redis().smembers(Keys.userRooms(id));
      const roomId = roomIds[0];
      let live = false;
      if (roomId) {
        const room = await getRoom(roomId);
        live = room?.status === "active";
      }
      result.push({
        userId: id,
        name: u.name ?? u.username,
        avatarUrl: u.avatarUrl,
        roomId,
        live,
      });
    }
    // 开播的排前面
    return result.sort((a, b) => Number(b.live) - Number(a.live));
  }
}
