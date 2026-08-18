import { Injectable } from "@nestjs/common";
import { Keys, type SystemFeatures } from "@starlive/shared";
import { redis } from "../common/redis";

const DEFAULT_FEATURES: SystemFeatures = {
  maintenanceEnabled: false,
  recordingEnabled: false,
  transcodingEnabled: false,
  lotteryEnabled: true,
  publicListEnabled: true,
};

const DEFAULT_CONFIG: Record<string, string> = {
  withdrawal_fee: "20", // 提现手续费 %
  min_withdrawal: "10", // 最低提现
  gift_coin_ratio: "1", // 1 元 = N 星币
};

function toBool(v: string | undefined, def: boolean): boolean {
  if (v === undefined) return def;
  return v === "true" || v === "1";
}

@Injectable()
export class SystemService {
  async getFeatures(): Promise<SystemFeatures> {
    const r = redis();
    const raw = await r.hgetall(Keys.systemFeatures);
    return {
      maintenanceEnabled: toBool(raw.maintenanceEnabled, DEFAULT_FEATURES.maintenanceEnabled),
      recordingEnabled: toBool(raw.recordingEnabled, DEFAULT_FEATURES.recordingEnabled),
      transcodingEnabled: toBool(raw.transcodingEnabled, DEFAULT_FEATURES.transcodingEnabled),
      lotteryEnabled: toBool(raw.lotteryEnabled, DEFAULT_FEATURES.lotteryEnabled),
      publicListEnabled: toBool(raw.publicListEnabled, DEFAULT_FEATURES.publicListEnabled),
      maintenanceMessage: raw.maintenanceMessage ?? "",
    };
  }

  async setFeature(key: string, value: boolean | string): Promise<void> {
    await redis().hset(Keys.systemFeatures, key, String(value));
  }

  async getConfig(): Promise<Record<string, string>> {
    const raw = await redis().hgetall(Keys.systemConfig);
    return { ...DEFAULT_CONFIG, ...raw };
  }

  async setConfig(partial: Record<string, string>): Promise<void> {
    if (Object.keys(partial).length === 0) return;
    await redis().hset(Keys.systemConfig, partial);
  }

  async getAnnouncement(): Promise<{ title: string; content: string }> {
    const raw = await redis().hgetall(Keys.systemConfig);
    return { title: raw.announcement_title ?? "", content: raw.announcement ?? "" };
  }
}
