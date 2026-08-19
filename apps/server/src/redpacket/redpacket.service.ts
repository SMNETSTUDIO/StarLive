import { Injectable } from "@nestjs/common";
import { ErrorCode, Keys, type Redpacket, type RedpacketMode } from "@starlive/shared";
import { genId } from "../common/audit";
import { BizException } from "../common/errors";
import { EVT, publishEvent } from "../common/event-bus";
import { acquireLock } from "../common/lock";
import { redis, redisPipeline } from "../common/redis";
import { getRoom } from "../common/room-store";
import {
  addTransaction,
  applyBalanceDelta,
  getBalance,
} from "../common/wallet-store";

const EXPIRE_MS = 24 * 60 * 60 * 1000;

function splitAmounts(total: number, count: number, mode: RedpacketMode): number[] {
  if (mode === "equal") {
    const base = Math.floor(total / count);
    const parts = new Array(count).fill(base);
    parts[count - 1] += total - base * count;
    return parts;
  }
  const parts: number[] = [];
  let remaining = total;
  for (let i = 0; i < count - 1; i++) {
    const max = Math.max(1, Math.floor((remaining / (count - i)) * 2));
    const part = Math.max(1, Math.floor(Math.random() * max));
    parts.push(part);
    remaining -= part;
  }
  parts.push(Math.max(1, remaining));
  return parts;
}

@Injectable()
export class RedpacketService {
  async create(input: {
    roomId: string;
    senderId: string;
    total: number;
    count: number;
    mode: RedpacketMode;
  }) {
    const total = Math.floor(input.total);
    const count = Math.floor(input.count);
    if (total <= 0) throw new BizException(ErrorCode.INVALID_AMOUNT, "红包金额无效");
    if (count < 1 || count > 100) throw new BizException(ErrorCode.INVALID_AMOUNT, "红包个数 1-100");
    if (total < count) throw new BizException(ErrorCode.INVALID_AMOUNT, "金额不能小于个数");

    const room = await getRoom(input.roomId);
    if (!room) throw new BizException(ErrorCode.NOT_FOUND, "房间不存在");

    const release = await acquireLock(`balance:${input.senderId}`, 15000);
    if (!release) throw new BizException(ErrorCode.INTERNAL, "系统繁忙");
    try {
      const b = await getBalance(input.senderId);
      if (b.coins < total) throw new BizException(ErrorCode.INSUFFICIENT_BALANCE, "星币余额不足");

      await applyBalanceDelta(input.senderId, { coins: -total });
      await addTransaction(input.senderId, "redpacket_send", -total, (await getBalance(input.senderId)).coins);

      const id = genId("rp_");
      const now = Date.now();
      const amounts = splitAmounts(total, count, input.mode);
      const packet: Redpacket = {
        id,
        roomId: input.roomId,
        senderId: input.senderId,
        total,
        count,
        mode: input.mode,
        createdAt: now,
        expiresAt: now + EXPIRE_MS,
      };
      await redisPipeline((p) => {
        p.hset(Keys.redpacket(id), {
          ...packet,
          total: String(total),
          count: String(count),
          createdAt: String(now),
          expiresAt: String(now + EXPIRE_MS),
          amounts: JSON.stringify(amounts),
          remaining: JSON.stringify(amounts),
        });
        p.zadd(Keys.roomRedpackets(input.roomId), now, id);
      });

      publishEvent(EVT.REDPACKET_CREATED, { id, roomId: input.roomId, total, count, mode: input.mode, ts: now });
      return { id };
    } finally {
      await release();
    }
  }

  async claim(redpacketId: string, userId: string) {
    const release = await acquireLock(`redpacket:${redpacketId}`, 15000);
    if (!release) throw new BizException(ErrorCode.INTERNAL, "系统繁忙");
    try {
      // 红包数据与领取记录并发读取（一次往返）
      const [raw, already] = await Promise.all([
        redis().hgetall(Keys.redpacket(redpacketId)),
        redis().sismember(Keys.redpacketClaims(redpacketId), userId),
      ]);
      if (!raw || !raw.id) throw new BizException(ErrorCode.NOT_FOUND, "红包不存在");
      if (Number(raw.expiresAt) < Date.now()) {
        throw new BizException(ErrorCode.REDPACKET_EXPIRED, "红包已过期");
      }
      if (already) throw new BizException(ErrorCode.DUPLICATE_CLAIM, "你已经领取过该红包");

      const remaining: number[] = raw.remaining ? JSON.parse(raw.remaining) : [];
      if (remaining.length === 0) throw new BizException(ErrorCode.REDPACKET_EMPTY, "红包已抢完");

      const amount = remaining.shift() as number;
      // 入账 + 领取标记 + 剩余额度更新合并一次往返（hincrbyfloat 返回新余额，免重读）
      const [afterRaw] = await redisPipeline<string>((p) => {
        p.hincrbyfloat(Keys.userBalance(userId), "coins", amount);
        p.sadd(Keys.redpacketClaims(redpacketId), userId);
        p.hset(Keys.redpacket(redpacketId), { remaining: JSON.stringify(remaining) });
      });
      await addTransaction(userId, "redpacket_receive", amount, Number(afterRaw), redpacketId);

      publishEvent(EVT.REDPACKET_CLAIMED, { redpacketId, roomId: raw.roomId, userName: userId, amount, ts: Date.now() });
      return { amount };
    } finally {
      await release();
    }
  }

  async list(roomId: string) {
    const now = Date.now();
    const ids = await redis().zrangebyscore(Keys.roomRedpackets(roomId), "-inf", "+inf");
    const rows = await redisPipeline<Record<string, string>>((p) => {
      for (const id of ids) p.hgetall(Keys.redpacket(id));
    });
    const out: Array<Record<string, unknown>> = [];
    for (const r of rows) {
      if (!r || !r.id) continue;
      const remaining: number[] = r.remaining ? JSON.parse(r.remaining) : [];
      const claimed = Number(r.count) - remaining.length;
      out.push({
        id: r.id,
        roomId: r.roomId,
        senderId: r.senderId,
        total: Number(r.total),
        count: Number(r.count),
        mode: r.mode,
        createdAt: Number(r.createdAt),
        expiresAt: Number(r.expiresAt),
        claimed,
        expired: Number(r.expiresAt) < now,
        empty: remaining.length === 0,
      });
    }
    return out.reverse();
  }
}
