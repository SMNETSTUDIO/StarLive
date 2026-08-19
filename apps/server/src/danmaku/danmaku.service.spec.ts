import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeRedis } from "../common/__testutils__/fake-redis";

const holder = vi.hoisted(() => ({ r: null as unknown as FakeRedis }));

vi.mock("../common/redis", () => ({
  redis: () => holder.r,
}));

import { DanmakuService } from "./danmaku.service";

describe("DanmakuService.checkRate（incr+expire 原子化）", () => {
  let svc: DanmakuService;

  beforeEach(() => {
    holder.r = new FakeRedis();
    svc = new DanmakuService();
  });

  // 通过 eval 单条命令实现限流：RATE_WINDOW_SEC=5s 内 RATE_MAX=8 条
  const check = (id: string) =>
    (svc as unknown as { checkRate(id: string): Promise<boolean> }).checkRate(id);

  it("窗口内前 8 条放行，第 9 条拒绝", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 9; i++) results.push(await check("u_1"));
    expect(results.slice(0, 8).every(Boolean)).toBe(true);
    expect(results[8]).toBe(false);
  });

  it("每次判定仅一次往返（单条 eval，非 incr+expire 两条）", async () => {
    await check("u_1");
    expect(holder.r.roundTrips).toBe(1);
  });

  it("不同身份独立计数", async () => {
    for (let i = 0; i < 8; i++) await check("u_1");
    // u_1 已到上限，u_2 仍应放行
    expect(await check("u_2")).toBe(true);
  });
});
