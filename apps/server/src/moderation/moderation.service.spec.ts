import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeRedis, makeRedisPipeline } from "../common/__testutils__/fake-redis";

const holder = vi.hoisted(() => ({ r: null as unknown as FakeRedis }));

vi.mock("../common/redis", () => ({
  redis: () => holder.r,
  redisPipeline: <T>(fn: (p: unknown) => void) =>
    makeRedisPipeline(holder.r)<T>(fn as never),
}));

import { ModerationService } from "./moderation.service";

describe("ModerationService 批量取用户（消除 N+1）", () => {
  let svc: ModerationService;

  beforeEach(() => {
    holder.r = new FakeRedis();
    svc = new ModerationService();
  });

  describe("listModerators", () => {
    it("无房管时返回空，不查用户", async () => {
      const out = await svc.listModerators("r1");
      expect(out).toEqual([]);
    });

    it("批量取回房管信息，未知用户回退为 id，且往返为常数", async () => {
      holder.r.seedSet("room:r1:moderators", ["u_1", "u_2", "u_ghost"]);
      holder.r.seedHash("user:u_1", { id: "u_1", username: "a", name: "Alice", avatarUrl: "x" });
      holder.r.seedHash("user:u_2", { id: "u_2", username: "bob" });

      const out = await svc.listModerators("r1");

      expect(out).toHaveLength(3);
      expect(out.find((m) => m.id === "u_1")).toMatchObject({ name: "Alice", avatarUrl: "x" });
      expect(out.find((m) => m.id === "u_2")).toMatchObject({ name: "bob" });
      // 未知用户名回退为 id 本身
      expect(out.find((m) => m.id === "u_ghost")).toMatchObject({ name: "u_ghost" });
      // 1 次 smembers + 1 次批量 pipeline = 2，与房管人数无关
      expect(holder.r.roundTrips).toBe(2);
    });
  });

  describe("mutedUsers", () => {
    it("过滤过期项，游客展示脱敏名，注册用户批量取名", async () => {
      const now = Date.now();
      holder.r.seedHash("room:r1:muted:list", {
        u_1: "0", // 永久禁言
        u_2: String(now + 60_000), // 生效中
        u_3: String(now - 1000), // 已过期，应剔除
        guest_abcd: "0", // 游客
      });
      holder.r.seedHash("user:u_1", { id: "u_1", username: "alice", name: "Alice" });
      holder.r.seedHash("user:u_2", { id: "u_2", username: "bob" });

      const out = await svc.mutedUsers("r1");

      const ids = out.map((o) => o.identity).sort();
      expect(ids).toEqual(["guest_abcd", "u_1", "u_2"]);
      expect(out.find((o) => o.identity === "u_1")).toMatchObject({ name: "Alice", expiresAt: 0 });
      expect(out.find((o) => o.identity === "guest_abcd")?.name).toMatch(/^游客_/);
      // 1 次 hgetall(muted:list) + 1 次批量 pipeline 取注册用户 = 2
      expect(holder.r.roundTrips).toBe(2);
    });

    it("无禁用项时返回空", async () => {
      const out = await svc.mutedUsers("r1");
      expect(out).toEqual([]);
    });
  });
});
