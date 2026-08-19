import { Injectable } from "@nestjs/common";
import { ErrorCode, Keys } from "@starlive/shared";
import { genId } from "../common/audit";
import { BizException } from "../common/errors";
import { EVT, publishEvent } from "../common/event-bus";
import { redis, redisPipeline } from "../common/redis";
import { getRoom } from "../common/room-store";

@Injectable()
export class ModerationService {
  async requirePrivilege(roomId: string, actorId: string): Promise<boolean> {
    const room = await getRoom(roomId);
    if (!room) throw new BizException(ErrorCode.NOT_FOUND, "房间不存在");
    if (room.ownerId === actorId) return true;
    const isMod = await redis().sismember(Keys.roomModerators(roomId), actorId);
    if (isMod) return true;
    const { resolveAdmin } = await import("../common/admin");
    const a = await resolveAdmin(actorId);
    return a.isSuperAdmin || a.permissions.includes("moderation.*") || a.permissions.includes("*");
  }

  async addModerator(roomId: string, actorId: string, targetUserId: string) {
    if (!(await this.requirePrivilege(roomId, actorId))) {
      throw new BizException(ErrorCode.FORBIDDEN, "无权限", 403);
    }
    await redis().sadd(Keys.roomModerators(roomId), targetUserId);
    await this.log(roomId, actorId, "add_moderator", targetUserId);
    return { ok: true };
  }

  async removeModerator(roomId: string, actorId: string, targetUserId: string) {
    if (!(await this.requirePrivilege(roomId, actorId))) {
      throw new BizException(ErrorCode.FORBIDDEN, "无权限", 403);
    }
    await redis().srem(Keys.roomModerators(roomId), targetUserId);
    await this.log(roomId, actorId, "remove_moderator", targetUserId);
    return { ok: true };
  }

  async listModerators(roomId: string) {
    const ids = await redis().smembers(Keys.roomModerators(roomId));
    if (ids.length === 0) return [];
    const { getUsersByIds } = await import("../common/user-store");
    const map = await getUsersByIds(ids);
    return ids.map((id) => {
      const u = map.get(id);
      return { id, name: u ? (u.name ?? u.username) : id, avatarUrl: u?.avatarUrl };
    });
  }

  async mute(
    roomId: string,
    actorId: string,
    target: { userId?: string; guestId?: string; name?: string },
    durationSec?: number,
  ) {
    if (!(await this.requirePrivilege(roomId, actorId))) {
      throw new BizException(ErrorCode.FORBIDDEN, "无权限", 403);
    }
    const identity = target.userId ?? target.guestId;
    if (!identity) throw new BizException(ErrorCode.INVALID_AMOUNT, "目标无效");

    const r = redis();
    const key = Keys.roomMuted(roomId, identity);
    if (durationSec && durationSec > 0) {
      await r.set(key, "1", "EX", durationSec);
      await r.hset(`${Keys.room(roomId)}:muted:list`, identity, String(Date.now() + durationSec * 1000));
    } else {
      await r.set(key, "1");
      await r.hset(`${Keys.room(roomId)}:muted:list`, identity, "0");
    }
    await this.log(roomId, actorId, "mute", { identity, durationSec });
    publishEvent(EVT.MUTE, { roomId, userId: target.userId, guestId: target.guestId, durationSec });
    return { ok: true };
  }

  async unmute(roomId: string, actorId: string, identity: string) {
    if (!(await this.requirePrivilege(roomId, actorId))) {
      throw new BizException(ErrorCode.FORBIDDEN, "无权限", 403);
    }
    await redisPipeline((p) => {
      p.del(Keys.roomMuted(roomId, identity));
      p.hdel(`${Keys.room(roomId)}:muted:list`, identity);
    });
    return { ok: true };
  }

  async mutedUsers(roomId: string) {
    const raw = await redis().hgetall(`${Keys.room(roomId)}:muted:list`);
    const now = Date.now();
    // 先按过期时间过滤出仍生效的条目，再一次流水线批量取注册用户
    const active = Object.entries(raw).filter(
      ([, expiresAt]) => expiresAt === "0" || Number(expiresAt) > now,
    );
    const { getUsersByIds } = await import("../common/user-store");
    const userIds = active.map(([identity]) => identity).filter((id) => id.startsWith("u_"));
    const map = await getUsersByIds(userIds);
    return active.map(([identity, expiresAt]) => {
      const u = identity.startsWith("u_") ? map.get(identity) : null;
      return {
        identity,
        name: u ? (u.name ?? u.username) : `游客_${identity.slice(-4)}`,
        expiresAt: expiresAt === "0" ? 0 : Number(expiresAt),
      };
    });
  }

  async moderationLog(roomId: string, limit = 50) {
    const entries = await redis().lrange(Keys.roomModerationLog(roomId), 0, limit - 1);
    return entries.map((e) => {
      try {
        return JSON.parse(e);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  async createReport(input: {
    reporterId: string;
    roomId: string;
    danmakuId?: string;
    targetUserId?: string;
    reason: string;
  }) {
    const id = genId("rpt_");
    await redisPipeline((p) => {
      p.hset(`report:${id}`, {
        id,
        reporterId: input.reporterId,
        roomId: input.roomId,
        danmakuId: input.danmakuId ?? "",
        targetUserId: input.targetUserId ?? "",
        reason: input.reason ?? "",
        status: "pending",
        createdAt: String(Date.now()),
      });
      p.zadd("reports:all", Date.now(), id);
    });
    return { id };
  }

  async listReports(status?: string) {
    const ids = await redis().zrevrange("reports:all", 0, 99);
    if (ids.length === 0) return [];
    const rows = await redisPipeline<Record<string, string>>((p) => {
      for (const id of ids) p.hgetall(`report:${id}`);
    });
    return rows
      .filter((r) => r && r.id)
      .filter((r) => !status || r.status === status);
  }

  async processReport(reportId: string, action: "resolve" | "dismiss", adminId: string) {
    const key = `report:${reportId}`;
    const exists = await redis().exists(key);
    if (!exists) throw new BizException(ErrorCode.NOT_FOUND, "举报不存在");
    await redis().hset(key, { status: action === "resolve" ? "resolved" : "dismissed", processedBy: adminId, processedAt: String(Date.now()) });
    return { ok: true };
  }

  private async log(roomId: string, actorId: string, action: string, detail?: unknown) {
    await redis().lpush(Keys.roomModerationLog(roomId), JSON.stringify({ actorId, action, detail, ts: Date.now() }));
    await redis().ltrim(Keys.roomModerationLog(roomId), 0, 199);
  }
}
