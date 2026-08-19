import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeRedis, makeRedisPipeline } from "./__testutils__/fake-redis";

// 每个测试重建 fake，通过 hoisted 持有以便 mock 工厂引用
const holder = vi.hoisted(() => ({ r: null as unknown as FakeRedis }));

vi.mock("./redis", () => ({
  redis: () => holder.r,
  redisPipeline: <T>(fn: (p: unknown) => void) =>
    makeRedisPipeline(holder.r)<T>(fn as never),
}));

import { getUsersByIds } from "./user-store";

describe("getUsersByIds", () => {
  beforeEach(() => {
    holder.r = new FakeRedis();
  });

  it("空数组直接返回空 Map，且不产生任何往返", async () => {
    const map = await getUsersByIds([]);
    expect(map.size).toBe(0);
    expect(holder.r.roundTrips).toBe(0);
  });

  it("批量取回并按 id 索引，跳过不存在的用户", async () => {
    holder.r.seedHash("user:u_1", { id: "u_1", username: "alice", name: "Alice" });
    holder.r.seedHash("user:u_3", { id: "u_3", username: "carol" });
    // u_2 不存在

    const map = await getUsersByIds(["u_1", "u_2", "u_3"]);

    expect(map.size).toBe(2);
    expect(map.get("u_1")?.name).toBe("Alice");
    expect(map.get("u_2")).toBeUndefined();
    expect(map.get("u_3")?.username).toBe("carol");
  });

  it("N 个用户只需 1 次往返（消除 N+1 的核心保证）", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      ids.push(`u_${i}`);
      holder.r.seedHash(`user:u_${i}`, { id: `u_${i}`, username: `user${i}` });
    }

    await getUsersByIds(ids);

    // 改造前是 50 次 hgetall；改造后应为单次 pipeline
    expect(holder.r.roundTrips).toBe(1);
  });
});
