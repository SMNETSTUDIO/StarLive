import { Keys } from "@starlive/shared";
import { config } from "../config/config";
import { cached, invalidateCache } from "./cache";
import { redis } from "./redis";
import { DEFAULT_ADMIN_PERMISSIONS } from "./permissions";

export interface AdminContext {
  isSuperAdmin: boolean;
  permissions: string[];
}

/**
 * 解析管理员上下文。每个管理端请求（守卫）与登录/me 都会调用，
 * 进程内缓存 10s 免去每次 1-2 次 Redis 往返；
 * 角色变更走 invalidateAdminContext() 即时失效（单实例部署下立即生效）。
 */
export async function resolveAdmin(userId: string): Promise<AdminContext> {
  if (config.adminUserIds.includes(userId)) {
    return { isSuperAdmin: true, permissions: DEFAULT_ADMIN_PERMISSIONS };
  }
  return cached(`admin:ctx:${userId}`, 10_000, async () => {
    const roleId = await redis().hget(Keys.adminUserRoles, userId);
    if (!roleId) return { isSuperAdmin: false, permissions: [] };
    if (roleId === "super_admin") {
      return { isSuperAdmin: true, permissions: DEFAULT_ADMIN_PERMISSIONS };
    }
    const permsJson = await redis().hget(Keys.adminRoles, roleId);
    let permissions: string[] = [];
    if (permsJson) {
      try {
        permissions = JSON.parse(permsJson) as string[];
      } catch {
        permissions = [];
      }
    }
    return { isSuperAdmin: false, permissions };
  });
}

/** 角色/授权变更后调用：不传 userId 清空全部管理员上下文缓存 */
export function invalidateAdminContext(userId?: string): void {
  invalidateCache(userId ? `admin:ctx:${userId}` : "admin:ctx:");
}
