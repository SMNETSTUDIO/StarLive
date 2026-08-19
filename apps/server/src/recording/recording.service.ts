import { Injectable } from "@nestjs/common";
import { randomBytes } from "crypto";
import { ErrorCode, Keys, type RecordingAsset } from "@starlive/shared";
import { genId } from "../common/audit";
import { BizException } from "../common/errors";
import { redis, redisPipeline } from "../common/redis";
import { getRoom } from "../common/room-store";
import { StreamService } from "../stream/stream.service";

const DEFAULT_SHARE_TTL = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class RecordingService {
  constructor(private readonly stream: StreamService) {}

  async list(roomId: string): Promise<RecordingAsset[]> {
    const room = await getRoom(roomId);
    if (!room) throw new BizException(ErrorCode.NOT_FOUND, "房间不存在");

    // 本地录制（worker 产出） + 流服务录制资产
    const ids = await redis().zrange(`room:recordings:${roomId}`, 0, -1);
    const local = ids.length
      ? (await redisPipeline<Record<string, string>>((p) => {
          for (const id of ids) p.hgetall(Keys.recording(id));
        })).filter((r) => r && r.id)
      : [];

    let remote: RecordingAsset[] = [];
    if (room.streamId) {
      try {
        remote = await this.stream.listRecordings(room.streamId, room.provider);
      } catch {
        remote = [];
      }
    }

    return [
      ...local.map((r) => ({
        id: r.id,
        streamId: r.roomId ?? "",
        duration: Number(r.duration ?? 0),
        createdAt: Number(r.createdAt ?? 0),
        downloadUrl: r.downloadUrl,
      })),
      ...remote,
    ];
  }

  async download(recordingId: string): Promise<{ url: string }> {
    const raw = await redis().hgetall(Keys.recording(recordingId));
    if (!raw || !raw.id) throw new BizException(ErrorCode.NOT_FOUND, "录播不存在");
    return { url: raw.downloadUrl ?? "" };
  }

  async createShare(recordingId: string, userId: string, permanent: boolean) {
    const raw = await redis().hgetall(Keys.recording(recordingId));
    if (!raw || !raw.id) throw new BizException(ErrorCode.NOT_FOUND, "录播不存在");
    const room = await getRoom(raw.roomId);
    if (!room) throw new BizException(ErrorCode.NOT_FOUND, "房间不存在");
    if (room.ownerId !== userId) {
      const { resolveAdmin } = await import("../common/admin");
      const a = await resolveAdmin(userId);
      if (!a.isSuperAdmin && !a.permissions.includes("recordings.*")) {
        throw new BizException(ErrorCode.FORBIDDEN, "无权限", 403);
      }
    }
    const token = randomBytes(24).toString("hex");
    const now = Date.now();
    await redisPipeline((p) => {
      p.hset(Keys.recordingShare(token), {
        token,
        recordingId,
        roomId: raw.roomId,
        createdAt: String(now),
        expiresAt: permanent ? "0" : String(now + DEFAULT_SHARE_TTL),
        permanent: permanent ? "true" : "false",
      });
      p.sadd(Keys.recordingShareList(raw.roomId), token);
    });
    return { token };
  }

  async shareInfo(token: string) {
    const raw = await redis().hgetall(Keys.recordingShare(token));
    if (!raw || !raw.token) throw new BizException(ErrorCode.NOT_FOUND, "分享链接无效");
    const expiresAt = Number(raw.expiresAt);
    if (expiresAt !== 0 && expiresAt < Date.now()) {
      throw new BizException(ErrorCode.NOT_FOUND, "分享链接已过期");
    }
    const rec = await redis().hgetall(Keys.recording(raw.recordingId));
    return {
      token,
      recordingId: raw.recordingId,
      roomId: raw.roomId,
      createdAt: Number(raw.createdAt),
      expiresAt,
      permanent: raw.permanent === "true",
      downloadUrl: rec?.downloadUrl ?? "",
    };
  }

  async listShares(roomId: string, userId: string) {
    const room = await getRoom(roomId);
    if (!room) throw new BizException(ErrorCode.NOT_FOUND, "房间不存在");
    if (room.ownerId !== userId) {
      throw new BizException(ErrorCode.FORBIDDEN, "无权限", 403);
    }
    const tokens = await redis().smembers(Keys.recordingShareList(roomId));
    if (tokens.length === 0) return [];
    const rows = await redisPipeline<Record<string, string>>((p) => {
      for (const t of tokens) p.hgetall(Keys.recordingShare(t));
    });
    return rows.filter((r) => r && r.token).map((r) => ({
      token: r.token,
      recordingId: r.recordingId,
      createdAt: Number(r.createdAt),
      expiresAt: Number(r.expiresAt),
      permanent: r.permanent === "true",
    }));
  }

  async revokeShare(token: string, userId: string) {
    const raw = await redis().hgetall(Keys.recordingShare(token));
    if (!raw || !raw.token) throw new BizException(ErrorCode.NOT_FOUND, "分享不存在");
    const room = await getRoom(raw.roomId);
    if (room && room.ownerId !== userId) {
      const { resolveAdmin } = await import("../common/admin");
      const a = await resolveAdmin(userId);
      if (!a.isSuperAdmin) throw new BizException(ErrorCode.FORBIDDEN, "无权限", 403);
    }
    await redisPipeline((p) => {
      p.del(Keys.recordingShare(token));
      p.srem(Keys.recordingShareList(raw.roomId), token);
    });
    return { ok: true };
  }

  async saveRecordingMeta(input: {
    roomId: string;
    title: string;
    downloadUrl: string;
    duration?: number;
  }): Promise<string> {
    const id = genId("rec_");
    await redisPipeline((p) => {
      p.hset(Keys.recording(id), {
        id,
        roomId: input.roomId,
        title: input.title,
        downloadUrl: input.downloadUrl,
        duration: String(input.duration ?? 0),
        createdAt: String(Date.now()),
      });
      p.zadd(`room:recordings:${input.roomId}`, Date.now(), id);
    });
    return id;
  }
}
