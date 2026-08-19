import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeRedis } from "./__testutils__/fake-redis";

const holder = vi.hoisted(() => ({ r: null as unknown as FakeRedis }));

vi.mock("./redis", () => ({
  redis: () => holder.r,
}));
vi.mock("../config/config", () => ({
  config: { adminUserIds: ["u_env_admin"] },
}));

import { invalidateAdminContext, resolveAdmin } from "./admin";
import { invalidateCache } from "./cache";

function seedRoleData(r: FakeRedis, userRoles: Record<string, string>, roles: Record<string, string>) {
  r.seedHash("admin:user_roles", userRoles);
  r.seedHash("admin:roles", roles);
}

describe("resolveAdmin（10s 进程内缓存 + 变更失效）", () => {
  beforeEach(() => {
    holder.r = new FakeRedis();
    invalidateCache(); // 清全局缓存，测试相互隔离
  });

  it("环境变量超管直通，不查 Redis", async () => {
    seedRoleData(holder.r, {}, {});
    const ctx = await resolveAdmin("u_env_admin");
    expect(ctx.isSuperAdmin).toBe(true);
    expect(holder.r.roundTrips).toBe(0);
  });

  it("角色解析后 10s 内重复调用命中缓存（不再往返 Redis）", async () => {
    seedRoleData(holder.r, { u_1: "mod" }, { mod: JSON.stringify(["rooms.*"]) });

    const first = await resolveAdmin("u_1");
    expect(first.permissions).toEqual(["rooms.*"]);
    const tripsAfterFirst = holder.r.roundTrips;
    expect(tripsAfterFirst).toBeGreaterThan(0);

    const second = await resolveAdmin("u_1");
    expect(second).toEqual(first);
    // 缓存命中：往返数不增长
    expect(holder.r.roundTrips).toBe(tripsAfterFirst);
  });

  it("invalidateAdminContext(userId) 后重新读取到最新角色", async () => {
    seedRoleData(holder.r, { u_1: "mod" }, { mod: JSON.stringify(["rooms.*"]) });
    expect((await resolveAdmin("u_1")).permissions).toEqual(["rooms.*"]);

    // 变更角色（模拟 setUserRole）并失效缓存
    seedRoleData(holder.r, { u_1: "super_admin" }, {});
    invalidateAdminContext("u_1");

    expect((await resolveAdmin("u_1")).isSuperAdmin).toBe(true);
  });

  it("无角色用户返回空权限", async () => {
    seedRoleData(holder.r, {}, {});
    const ctx = await resolveAdmin("u_nobody");
    expect(ctx).toEqual({ isSuperAdmin: false, permissions: [] });
  });
});
