import { randomUUID } from "crypto";
import { redis } from "./redis";
import { Keys } from "@starlive/shared";

export async function writeAdminAuditLog(
  action: string,
  adminId: string,
  detail?: unknown,
): Promise<void> {
  const entry = JSON.stringify({ action, adminId, detail, ts: Date.now() });
  const r = redis();
  await r.lpush(Keys.adminAuditLog, entry);
  await r.ltrim(Keys.adminAuditLog, 0, 999);
}

export function genId(prefix = ""): string {
  return `${prefix}${Date.now().toString(36)}${randomUUID().slice(0, 8)}`;
}
