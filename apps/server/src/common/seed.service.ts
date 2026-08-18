import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { Keys } from "@starlive/shared";
import { redis } from "../common/redis";

const DEFAULT_GIFTS = [
  { id: "heart", name: "小心心", price: 1 },
  { id: "rose", name: "玫瑰花", price: 5 },
  { id: "car", name: "跑车", price: 66 },
  { id: "rocket", name: "火箭", price: 520 },
  { id: "crown", name: "皇冠", price: 1314 },
];

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      // Redis 暂不可用时不阻断启动
      // eslint-disable-next-line no-console
      console.warn("[seed] skipped:", (err as Error)?.message);
    }
  }

  private async seed(): Promise<void> {
    const r = redis();

    // 播种默认礼物
    for (const g of DEFAULT_GIFTS) {
      const exists = await r.hexists(Keys.giftDef(g.id), "id");
      if (!exists) {
        await r.hset(Keys.giftDef(g.id), { ...g, price: String(g.price) });
      }
      await r.zadd(Keys.giftsActive, g.price, g.id);
    }

    // 播种系统开关默认值（不覆盖已有值）
    const features = await r.hgetall(Keys.systemFeatures);
    const defaults: Record<string, string> = {
      maintenanceEnabled: "false",
      recordingEnabled: "false",
      transcodingEnabled: "false",
      lotteryEnabled: "true",
      publicListEnabled: "true",
    };
    for (const [k, v] of Object.entries(defaults)) {
      if (!(k in features)) await r.hset(Keys.systemFeatures, k, v);
    }
  }
}
