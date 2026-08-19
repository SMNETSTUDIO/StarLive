import { Injectable } from "@nestjs/common";
import { randomInt } from "crypto";
import { ErrorCode, Keys, type DanmakuMessage } from "@starlive/shared";
import { cached } from "../common/cache";
import { BizException } from "../common/errors";
import { EVT, publishEvent } from "../common/event-bus";
import { redis } from "../common/redis";
import { getRoom } from "../common/room-store";
import { getUserById } from "../common/user-store";

const MAX_LEN = 30;
const RATE_WINDOW_SEC = 5;
const RATE_MAX = 8;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_KEEP = 150;

const COLORS = ["#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#4dabf7", "#9775fa", "#f783ac", "#38d9a9"];

function pickColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

@Injectable()
export class DanmakuService {
  async send(input: {
    roomId: string;
    content: string;
    userId?: string;
    guestId?: string;
    name: string;
    avatar?: string;
  }) {
    const content = (input.content ?? "").trim();
    if (!content) throw new BizException(ErrorCode.INVALID_AMOUNT, "弹幕不能为空");
    if (content.length > MAX_LEN) {
      throw new BizException(ErrorCode.INVALID_AMOUNT, `弹幕最长 ${MAX_LEN} 字符`);
    }

    const identity = input.userId ?? input.guestId ?? "anon";

    // 全部前置校验并发执行（autoPipelining 合并为一次往返；原为 6+ 次串行）
    const [room, globalMute, user, roomMuted, rateOk, words] = await Promise.all([
      getRoom(input.roomId),
      redis().hget(Keys.systemConfig, "global_mute"),
      input.userId ? getUserById(input.userId) : Promise.resolve(null),
      redis().exists(Keys.roomMuted(input.roomId, identity)),
      this.checkRate(identity),
      cached("sensitive_words", 60_000, () => redis().smembers(Keys.adminSensitiveWords)),
    ]);

    if (!room) throw new BizException(ErrorCode.NOT_FOUND, "房间不存在");
    if (room.banned) throw new BizException(ErrorCode.ROOM_BANNED, "房间已被封禁", 403);
    if (globalMute === "true") throw new BizException(ErrorCode.MUTED, "全站禁言中");
    if (user?.banned === "true") throw new BizException(ErrorCode.BANNED, "账号已被封禁", 403);
    if (user?.muted === "true") throw new BizException(ErrorCode.MUTED, "你已被禁言");
    if (roomMuted) throw new BizException(ErrorCode.ROOM_MUTED, "你已被房间禁言");
    if (!rateOk) throw new BizException(ErrorCode.RATE_LIMITED, "发送太频繁，请稍后再试");

    const lower = content.toLowerCase();
    for (const w of words) {
      if (w && lower.includes(w.toLowerCase())) {
        throw new BizException(ErrorCode.SENSITIVE_WORD, "内容包含敏感词");
      }
    }

    const msg: DanmakuMessage = {
      id: `d_${Date.now().toString(36)}${randomInt(0, 1e6).toString(36)}`,
      roomId: input.roomId,
      userId: input.userId,
      guestId: input.guestId,
      name: input.name || "游客",
      avatar: input.avatar,
      color: pickColor(identity),
      content,
      ts: Date.now(),
    };

    // 写入 + 截断 + 更新时间戳合并为一次 pipeline 往返
    // （zremrangebyrank 负 rank 无条件保留最新 MAX_KEEP 条，无需先 zcard）
    const { redisPipeline } = await import("../common/redis");
    await redisPipeline((p) => {
      p.zadd(Keys.danmakuZset(input.roomId), msg.ts, JSON.stringify(msg));
      p.zremrangebyrank(Keys.danmakuZset(input.roomId), 0, -(MAX_KEEP + 1));
      p.set(Keys.danmakuLastUpdate(input.roomId), String(msg.ts));
    });

    publishEvent(EVT.DANMAKU, msg);
    return msg;
  }

  async list(roomId: string, since?: number): Promise<DanmakuMessage[]> {
    const min = since ? since : Date.now() - WINDOW_MS;
    const members = await redis().zrangebyscore(Keys.danmakuZset(roomId), `(${min}`, "+inf");
    return members
      .map((m) => {
        try {
          return JSON.parse(m) as DanmakuMessage;
        } catch {
          return null;
        }
      })
      .filter((m): m is DanmakuMessage => m !== null);
  }

  async recent(roomId: string, limit = 150): Promise<DanmakuMessage[]> {
    const members = await redis().zrevrange(Keys.danmakuZset(roomId), 0, limit - 1);
    return members
      .map((m) => {
        try {
          return JSON.parse(m) as DanmakuMessage;
        } catch {
          return null;
        }
      })
      .filter((m): m is DanmakuMessage => m !== null)
      .reverse();
  }

  private async checkRate(identity: string): Promise<boolean> {
    const key = `rl:danmaku:${identity}`;
    // incr 与首次 expire 原子执行：避免首条命令后崩溃残留无 TTL 的计数键
    const script =
      "local c = redis.call('incr', KEYS[1]) " +
      "if c == 1 then redis.call('expire', KEYS[1], ARGV[1]) end " +
      "return c";
    const count = (await redis().eval(script, 1, key, String(RATE_WINDOW_SEC))) as number;
    return count <= RATE_MAX;
  }
}
