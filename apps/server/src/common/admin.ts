import { Keys } from "@starlive/shared";
import { config } from "../config/config";
import { redis } from "./redis";
import { DEFAULT_ADMIN_PERMISSIONS } from "./permissions";

export interface AdminContext {
  isSuperAdmin: boolean;
  permissions: string[];
}

export async function resolveAdmin(userId: string): Promise<AdminContext> {
  if (config.adminUserIds.includes(userId)) {
    return { isSuperAdmin: true, permissions: DEFAULT_ADMIN_PERMISSIONS };
  }
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
}
