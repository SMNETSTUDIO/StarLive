import { Injectable } from "@nestjs/common";
import { ErrorCode, Keys, type GiftDefinition, type GiftMessage } from "@starlive/shared";
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

@Injectable()
export class GiftService {
  async list(): Promise<GiftDefinition[]> {
    const ids = await redis().zrange(Keys.giftsActive, 0, -1);
    if (ids.length === 0) return [];
    const rows = await redisPipeline<Record<string, string>>((p) => {
      for (const id of ids) p.hgetall(Keys.giftDef(id));
    });
    return rows
      .filter((r) => r && r.id)
      .map((r) => ({
        id: r.id,
        name: r.name,
        icon: r.icon,
        price: Number(r.price),
      }));
  }

  async send(input: {
    roomId: string;
    giftId: string;
    count: number;
    userId: string;
    name: string;
    avatar?: string;
  }) {
    const count = Math.floor(input.count);
    if (count < 1 || count > 100) {
      throw new BizException(ErrorCode.INVALID_AMOUNT, "单次送礼 1-100 个");
    }
    const giftRaw = await redis().hgetall(Keys.giftDef(input.giftId));
    if (!giftRaw || !giftRaw.id) throw new BizException(ErrorCode.NOT_FOUND, "礼物不存在");
    const price = Number(giftRaw.price);
    const total = price * count;

    const room = await getRoom(input.roomId);
    if (!room) throw new BizException(ErrorCode.NOT_FOUND, "房间不存在");
    const toUserId = room.ownerId;

    const release = await acquireLock(`balance:${input.userId}`, 15000);
    if (!release) throw new BizException(ErrorCode.INTERNAL, "系统繁忙");
    try {
      const balance = await getBalance(input.userId);
      if (balance.coins < total) {
        throw new BizException(ErrorCode.INSUFFICIENT_BALANCE, "星币余额不足");
      }
      await applyBalanceDelta(input.userId, { coins: -total });
      await applyBalanceDelta(toUserId, { coins: total });

      const senderAfter = (await getBalance(input.userId)).coins;
      const receiverAfter = (await getBalance(toUserId)).coins;
      const rewardId = genId("rw_");

      await redisPipeline((p) => {
        p.hset(Keys.rewardRecord(rewardId), {
          id: rewardId,
          roomId: input.roomId,
          fromUserId: input.userId,
          toUserId,
          giftId: input.giftId,
          giftName: giftRaw.name,
          count: String(count),
          price: String(price),
          total: String(total),
          ts: String(Date.now()),
        });
        p.zadd(Keys.roomRewards(input.roomId), Date.now(), rewardId);
      });

      await addTransaction(input.userId, "gift_send", -total, senderAfter, rewardId);
      await addTransaction(toUserId, "gift_receive", total, receiverAfter, rewardId);

      const msg: GiftMessage = {
        id: rewardId,
        roomId: input.roomId,
        fromUserId: input.userId,
        fromName: input.name,
        fromAvatar: input.avatar,
        giftId: input.giftId,
        giftName: giftRaw.name,
        giftIcon: giftRaw.icon,
        count,
        price,
        ts: Date.now(),
      };
      publishEvent(EVT.GIFT, msg);
      return msg;
    } finally {
      await release();
    }
  }

  async roomRewards(roomId: string) {
    const ids = await redis().zrevrange(Keys.roomRewards(roomId), 0, 99);
    if (ids.length === 0) return [];
    const rows = await redisPipeline<Record<string, string>>((p) => {
      for (const id of ids) p.hgetall(Keys.rewardRecord(id));
    });
    return rows.filter((r) => r && r.id);
  }
}
