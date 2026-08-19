import { Injectable } from "@nestjs/common";
import { ErrorCode, Keys, type GiftDefinition, type GiftMessage } from "@starlive/shared";
import { genId } from "../common/audit";
import { cached } from "../common/cache";
import { BizException } from "../common/errors";
import { EVT, publishEvent } from "../common/event-bus";
import { acquireLock } from "../common/lock";
import { redis, redisPipeline } from "../common/redis";
import { getRoom } from "../common/room-store";
import { getBalance, transferCoins } from "../common/wallet-store";

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
    // 礼物定义 60s 内存缓存（几乎不变），与房间信息并发读取
    const [giftRaw, room] = await Promise.all([
      cached(`gift:def:${input.giftId}`, 60_000, () => redis().hgetall(Keys.giftDef(input.giftId))),
      getRoom(input.roomId),
    ]);
    if (!giftRaw || !giftRaw.id) throw new BizException(ErrorCode.NOT_FOUND, "礼物不存在");
    const price = Number(giftRaw.price);
    const total = price * count;

    if (!room) throw new BizException(ErrorCode.NOT_FOUND, "房间不存在");
    const toUserId = room.ownerId;

    const release = await acquireLock(`balance:${input.userId}`, 15000);
    if (!release) throw new BizException(ErrorCode.INTERNAL, "系统繁忙");
    try {
      const balance = await getBalance(input.userId);
      if (balance.coins < total) {
        throw new BizException(ErrorCode.INSUFFICIENT_BALANCE, "星币余额不足");
      }
      const rewardId = genId("rw_");

      // 转账（扣款+入账+双方流水，2 次往返）与打赏记录写入互不依赖，并发执行
      await Promise.all([
        transferCoins(input.userId, toUserId, total, "gift_send", "gift_receive", rewardId),
        redisPipeline((p) => {
        p.hset(Keys.rewardRecord(rewardId), {
          id: rewardId,
          roomId: input.roomId,
          fromUserId: input.userId,
          fromName: input.name,
          toUserId,
          giftId: input.giftId,
          giftName: giftRaw.name,
          count: String(count),
          price: String(price),
          total: String(total),
          ts: String(Date.now()),
        });
        p.zadd(Keys.roomRewards(input.roomId), Date.now(), rewardId);
        }),
      ]);

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

  /** 主播收益统计：聚合名下所有房间近 N 天的打赏记录（趋势/分房间/贡献榜/最近明细） */
  async ownerEarnings(userId: string, days = 14) {
    const windowDays = Math.min(Math.max(Math.floor(days) || 14, 1), 30);
    const r = redis();
    const roomIds = await r.smembers(Keys.userRooms(userId));
    const since = Date.now() - windowDays * 86400_000;

    // 各房间窗口内的打赏记录（每房间上限 1000 条，防极端数据量）
    const records: Record<string, string>[] = [];
    for (const roomId of roomIds) {
      const ids = await r.zrevrangebyscore(Keys.roomRewards(roomId), "+inf", since, "LIMIT", 0, 1000);
      if (ids.length === 0) continue;
      const rows = await redisPipeline<Record<string, string>>((p) => {
        for (const id of ids) p.hgetall(Keys.rewardRecord(id));
      });
      records.push(...rows.filter((x) => x && x.id));
    }

    // 按天趋势（对齐管理后台的桶格式）
    const buckets: { date: string; key: string; coins: number; count: number }[] = [];
    const now = new Date();
    for (let i = windowDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      buckets.push({ date: `${d.getMonth() + 1}/${d.getDate()}`, key: d.toDateString(), coins: 0, count: 0 });
    }
    const bucketByKey = new Map(buckets.map((b) => [b.key, b]));

    const byRoom = new Map<string, { roomId: string; coins: number; count: number }>();
    const byGifter = new Map<string, { userId: string; name: string; coins: number; count: number }>();
    let totalCoins = 0;
    let totalCount = 0;

    for (const rec of records) {
      const coins = Number(rec.total) || 0;
      const count = Number(rec.count) || 0;
      const ts = Number(rec.ts) || 0;
      totalCoins += coins;
      totalCount += count;

      const bucket = bucketByKey.get(new Date(ts).toDateString());
      if (bucket) {
        bucket.coins += coins;
        bucket.count += count;
      }

      const room = byRoom.get(rec.roomId) ?? { roomId: rec.roomId, coins: 0, count: 0 };
      room.coins += coins;
      room.count += count;
      byRoom.set(rec.roomId, room);

      const gifterKey = rec.fromUserId || rec.fromName;
      const gifter = byGifter.get(gifterKey) ?? {
        userId: rec.fromUserId,
        name: rec.fromName || "用户",
        coins: 0,
        count: 0,
      };
      gifter.coins += coins;
      gifter.count += count;
      byGifter.set(gifterKey, gifter);
    }

    // 房间标题（含窗口内无收益的房间，便于前端逐房间展示）
    const roomsOut: { roomId: string; title: string; coins: number; count: number }[] = [];
    for (const roomId of roomIds) {
      const room = await getRoom(roomId);
      const agg = byRoom.get(roomId);
      roomsOut.push({ roomId, title: room?.title ?? roomId, coins: agg?.coins ?? 0, count: agg?.count ?? 0 });
    }
    roomsOut.sort((a, b) => b.coins - a.coins);

    const recent = records
      .sort((a, b) => Number(b.ts) - Number(a.ts))
      .slice(0, 20)
      .map((rec) => ({
        id: rec.id,
        roomId: rec.roomId,
        fromName: rec.fromName,
        giftId: rec.giftId,
        giftName: rec.giftName,
        count: Number(rec.count) || 0,
        total: Number(rec.total) || 0,
        ts: Number(rec.ts) || 0,
      }));

    return {
      days: windowDays,
      totalCoins,
      totalCount,
      trend: buckets.map(({ date, coins, count }) => ({ date, coins, count })),
      rooms: roomsOut,
      topGifters: [...byGifter.values()].sort((a, b) => b.coins - a.coins).slice(0, 10),
      recent,
    };
  }
}
