import { randomUUID } from "crypto";
import { redis } from "./redis";

/**
 * 基于 Redis SET NX PX 的分布式锁。
 * 返回释放函数；获取失败返回 null。
 */
export async function acquireLock(
  name: string,
  ttlMs = 10_000,
): Promise<(() => Promise<void>) | null> {
  const token = randomUUID();
  const key = `lock:${name}`;
  const ok = await redis().set(key, token, "PX", ttlMs, "NX");
  if (ok !== "OK") return null;

  return async () => {
    const script =
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
    await redis().eval(script, 1, key, token);
  };
}
