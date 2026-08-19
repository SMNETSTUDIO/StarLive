import type { UserProfile } from "@starlive/shared";
import { Keys } from "@starlive/shared";
import { redis, redisPipeline } from "./redis";
import { genId } from "./audit";

export interface UserRecord {
  id: string;
  name: string;
  username: string;
  email?: string;
  passwordHash?: string;
  avatarUrl?: string;
  banned?: string;
  muted?: string;
  createdAt?: string;
}

export function toProfile(u: UserRecord): UserProfile {
  return {
    id: u.id,
    name: u.name ?? u.username,
    username: u.username,
    email: u.email,
    avatarUrl: u.avatarUrl,
    banned: u.banned === "true" || u.banned === "1",
    muted: u.muted === "true" || u.muted === "1",
  };
}

export async function createUser(input: {
  username: string;
  email?: string;
  passwordHash: string;
  name?: string;
}): Promise<UserRecord> {
  const id = genId("u_");
  const now = Date.now();
  const rec: UserRecord = {
    id,
    username: input.username,
    email: input.email,
    name: input.name ?? input.username,
    passwordHash: input.passwordHash,
    createdAt: String(now),
  };
  const r = redis();
  await redisPipeline((p) => {
    p.hset(Keys.user(id), rec as unknown as Record<string, string>);
    p.sadd(Keys.usersSet, id);
    p.set(Keys.userByUsername(input.username), id);
    if (input.email) p.set(Keys.userByEmail(input.email), id);
  });
  return rec;
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const raw = await redis().hgetall(Keys.user(id));
  if (!raw || !raw.id) return null;
  return raw as unknown as UserRecord;
}

/**
 * 批量取用户：一次流水线取回全部 hgetall，避免 for-await 逐个往返。
 * 返回按 id 索引的 Map（不存在的用户不入表）。
 */
export async function getUsersByIds(ids: string[]): Promise<Map<string, UserRecord>> {
  const map = new Map<string, UserRecord>();
  if (ids.length === 0) return map;
  const rows = await redisPipeline<Record<string, string>>((p) => {
    for (const id of ids) p.hgetall(Keys.user(id));
  });
  rows.forEach((raw, i) => {
    if (raw && raw.id) map.set(ids[i], raw as unknown as UserRecord);
  });
  return map;
}

export async function getUserByUsername(username: string): Promise<UserRecord | null> {
  const id = await redis().get(Keys.userByUsername(username));
  if (!id) return null;
  return getUserById(id);
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const id = await redis().get(Keys.userByEmail(email));
  if (!id) return null;
  return getUserById(id);
}

export async function setUserField(id: string, field: string, value: string): Promise<void> {
  await redis().hset(Keys.user(id), field, value);
}
