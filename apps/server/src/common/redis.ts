import { Redis, type ChainableCommander } from "ioredis";
import { config } from "../config/config";

let client: Redis | null = null;

export function redis(): Redis {
  if (!client) {
    client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 500, 5000),
      // 同一事件循环内的并发命令自动合并为 pipeline 发送：
      // 远程 Redis（如 Upstash）下单命令往返上百毫秒，合并后吞吐量大幅提升
      enableAutoPipelining: true,
      keepAlive: 10_000,
    });
    client.on("error", (err) => {
      // 连接失败不使进程崩溃，健康检查负责上报状态
      // eslint-disable-next-line no-console
      console.error("[redis]", err.message);
    });
  }
  return client;
}

/**
 * 以 pipeline 批量执行命令，返回每个命令的结果（剔除错误层）。
 */
export async function redisPipeline<T = unknown>(
  fn: (pipe: ChainableCommander) => void,
): Promise<T[]> {
  const pipe = redis().pipeline();
  fn(pipe);
  const result = await pipe.exec();
  if (!result) return [];
  return result.map(([err, value]) => {
    if (err) throw err;
    return value as T;
  });
}
