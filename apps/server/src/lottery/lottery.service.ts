import { Injectable } from "@nestjs/common";
import { ErrorCode, Keys, type Lottery } from "@starlive/shared";
import { genId } from "../common/audit";
import { BizException } from "../common/errors";
import { EVT, publishEvent } from "../common/event-bus";
import { acquireLock } from "../common/lock";
import { redis, redisPipeline } from "../common/redis";
import { getRoom } from "../common/room-store";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

@Injectable()
export class LotteryService {
  async create(input: {
    roomId: string;
    ownerId: string;
    title: string;
    winnerCount: number;
    durationSec: number;
  }) {
    const room = await getRoom(input.roomId);
    if (!room) throw new BizException(ErrorCode.NOT_FOUND, "房间不存在");
    if (room.ownerId !== input.ownerId) {
      throw new BizException(ErrorCode.FORBIDDEN, "仅房主可发起抽奖", 403);
    }
    const winnerCount = Math.floor(input.winnerCount);
    if (winnerCount < 1 || winnerCount > 100) {
      throw new BizException(ErrorCode.INVALID_AMOUNT, "中奖人数 1-100");
    }
    const durationSec = Math.floor(input.durationSec);
    if (durationSec < 10 || durationSec > 3600) {
      throw new BizException(ErrorCode.INVALID_AMOUNT, "倒计时 10 秒 - 1 小时");
    }

    const id = genId("lt_");
    const now = Date.now();
    const lottery: Lottery = {
      id,
      roomId: input.roomId,
      ownerId: input.ownerId,
      title: input.title || "幸运抽奖",
      winnerCount,
      startedAt: now,
      endsAt: now + durationSec * 1000,
      drawn: false,
    };
    await redisPipeline((p) => {
      p.hset(Keys.lottery(id), {
        ...lottery,
        winnerCount: String(winnerCount),
        startedAt: String(now),
        endsAt: String(lottery.endsAt),
        drawn: "false",
      });
      p.set(Keys.roomActiveLottery(input.roomId), id);
    });

    publishEvent(EVT.LOTTERY_STARTED, { id, roomId: input.roomId, title: lottery.title, winnerCount, ts: now });
    return { id, endsAt: lottery.endsAt };
  }

  async join(lotteryId: string, userId: string) {
    const raw = await redis().hgetall(Keys.lottery(lotteryId));
    if (!raw || !raw.id) throw new BizException(ErrorCode.NOT_FOUND, "抽奖不存在");
    if (raw.drawn === "true") throw new BizException(ErrorCode.LOTTERY_NOT_ACTIVE, "抽奖已结束");
    if (Number(raw.endsAt) < Date.now()) throw new BizException(ErrorCode.LOTTERY_NOT_ACTIVE, "抽奖已结束");

    const added = await redis().sadd(Keys.lotteryParticipants(lotteryId), userId);
    if (added === 0) throw new BizException(ErrorCode.ALREADY_JOINED, "你已参与该抽奖");

    publishEvent(EVT.LOTTERY_JOINED, {
      id: lotteryId,
      roomId: raw.roomId,
      title: raw.title,
      winnerCount: Number(raw.winnerCount),
      ts: Date.now(),
    });
    return { ok: true };
  }

  async draw(lotteryId: string, ownerId: string) {
    const release = await acquireLock(`lottery:${lotteryId}`, 15000);
    if (!release) throw new BizException(ErrorCode.INTERNAL, "系统繁忙");
    try {
      const raw = await redis().hgetall(Keys.lottery(lotteryId));
      if (!raw || !raw.id) throw new BizException(ErrorCode.NOT_FOUND, "抽奖不存在");
      if (raw.ownerId !== ownerId) throw new BizException(ErrorCode.FORBIDDEN, "仅房主可开奖", 403);
      if (raw.drawn === "true") throw new BizException(ErrorCode.LOTTERY_NOT_ACTIVE, "已开奖");

      const participants = await redis().smembers(Keys.lotteryParticipants(lotteryId));
      const winnerCount = Math.min(Number(raw.winnerCount), participants.length);
      const winners = shuffle(participants).slice(0, winnerCount);

      // 中奖者解析为用户名，弹窗/面板直接可读
      const { getUserById } = await import("../common/user-store");
      const winnerNames = (
        await Promise.all(winners.map((id) => getUserById(id)))
      ).map((u, i) => u?.name ?? u?.username ?? winners[i]);

      await redisPipeline((p) => {
        p.hset(Keys.lottery(lotteryId), {
          drawn: "true",
          winners: JSON.stringify(winners),
          winnerNames: JSON.stringify(winnerNames),
        });
        p.del(Keys.roomActiveLottery(raw.roomId));
        p.lpush(Keys.roomLotteries(raw.roomId), lotteryId);
      });

      publishEvent(EVT.LOTTERY_DRAWN, {
        id: lotteryId,
        roomId: raw.roomId,
        winners,
        winnerNames,
        participants: participants.length,
        ts: Date.now(),
      });
      return { winners, winnerNames };
    } finally {
      await release();
    }
  }

  async get(roomId: string) {
    const id = await redis().get(Keys.roomActiveLottery(roomId));
    if (!id) return null;
    const raw = await redis().hgetall(Keys.lottery(id));
    if (!raw || !raw.id) return null;
    const participants = await redis().scard(Keys.lotteryParticipants(id));
    return {
      id: raw.id,
      roomId: raw.roomId,
      ownerId: raw.ownerId,
      title: raw.title,
      winnerCount: Number(raw.winnerCount),
      startedAt: Number(raw.startedAt),
      endsAt: Number(raw.endsAt),
      drawn: raw.drawn === "true",
      participants,
    };
  }

  async history(roomId: string, limit = 20) {
    const ids = await redis().lrange(Keys.roomLotteries(roomId), 0, limit - 1);
    if (ids.length === 0) return [];
    const rows = await redisPipeline<Record<string, string>>((p) => {
      for (const id of ids) p.hgetall(Keys.lottery(id));
    });
    return rows
      .filter((r) => r && r.id)
      .map((r) => ({
        id: r.id,
        title: r.title,
        winnerCount: Number(r.winnerCount),
        winners: r.winners ? JSON.parse(r.winners) : [],
        endsAt: Number(r.endsAt),
      }));
  }
}
