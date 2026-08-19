import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeRedis, makeRedisPipeline } from "../common/__testutils__/fake-redis";

const holder = vi.hoisted(() => ({ r: null as unknown as FakeRedis }));

vi.mock("../common/redis", () => ({
  redis: () => holder.r,
  redisPipeline: <T>(fn: (p: unknown) => void) =>
    makeRedisPipeline(holder.r)<T>(fn as never),
}));

import { RoomsService } from "./rooms.service";
import type { StreamService } from "../stream/stream.service";

describe("RoomsService.followingList（消除 N+1）", () => {
  let svc: RoomsService;

  beforeEach(() => {
    holder.r = new FakeRedis();
    svc = new RoomsService({} as StreamService);
  });

  it("无关注时返回空", async () => {
    expect(await svc.followingList("me")).toEqual([]);
  });

  it("组装用户+房间+开播状态，开播者排前，且往返为常数", async () => {
    holder.r.seedSet("user:following:me", ["u_1", "u_2", "u_3"]);
    // u_1：有房间且在播
    holder.r.seedHash("user:u_1", { id: "u_1", username: "alice", name: "Alice" });
    holder.r.seedSet("userRooms:u_1", ["room1"]);
    holder.r.seedHash("room:room1", { id: "room1", status: "active" });
    // u_2：有房间但未开播
    holder.r.seedHash("user:u_2", { id: "u_2", username: "bob" });
    holder.r.seedSet("userRooms:u_2", ["room2"]);
    holder.r.seedHash("room:room2", { id: "room2", status: "idle" });
    // u_3：无房间
    holder.r.seedHash("user:u_3", { id: "u_3", username: "carol" });

    const out = await svc.followingList("me");

    expect(out).toHaveLength(3);
    // 开播的 u_1 排第一
    expect(out[0]).toMatchObject({ userId: "u_1", live: true, roomId: "room1" });
    const bob = out.find((o) => o.userId === "u_2");
    expect(bob).toMatchObject({ live: false, roomId: "room2" });
    const carol = out.find((o) => o.userId === "u_3");
    expect(carol).toMatchObject({ live: false });
    expect(carol?.roomId).toBeUndefined();

    // 1 smembers(following) + [批量 users, 批量 userRooms] 并发 2 次 pipeline + 1 次 status pipeline = 4
    // 关键：与关注数量 N 无关（改造前为 ~3N 次串行往返）
    expect(holder.r.roundTrips).toBe(4);
  });

  it("跳过已不存在的被关注用户", async () => {
    holder.r.seedSet("user:following:me", ["u_1", "u_gone"]);
    holder.r.seedHash("user:u_1", { id: "u_1", username: "alice" });

    const out = await svc.followingList("me");
    expect(out.map((o) => o.userId)).toEqual(["u_1"]);
  });
});
