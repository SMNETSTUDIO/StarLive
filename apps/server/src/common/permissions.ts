export const DEFAULT_ADMIN_PERMISSIONS = [
  "system.*",
  "users.*",
  "stats.read",
  "rooms.*",
  "moderation.*",
  "recordings.*",
  "withdrawals.*",
  "orders.read",
  "audit.read",
];

export function matchPermission(
  permission: string,
  granted: string[],
): boolean {
  if (granted.includes("*")) return true;
  if (granted.includes(permission)) return true;
  const [prefix] = permission.split(".");
  return granted.includes(`${prefix}.*`);
}
