import type { Request } from "express";
import { ErrorCode } from "@starlive/shared";
import { BizException } from "./errors";
import { redis } from "./redis";

/**
 * 基于 Redis 的固定窗口速率限制。
 * @returns 是否允许本次请求
 */
export async function rateLimit(
  key: string,
  max: number,
  windowSec: number,
): Promise<boolean> {
  const r = redis();
  const k = `rl:${key}`;
  const count = await r.incr(k);
  if (count === 1) await r.expire(k, windowSec);
  return count <= max;
}

/** 超限时直接抛出 RATE_LIMITED 业务异常 */
export async function assertRateLimit(
  key: string,
  max: number,
  windowSec: number,
  message = "操作太频繁，请稍后再试",
): Promise<void> {
  if (!(await rateLimit(key, max, windowSec))) {
    throw new BizException(ErrorCode.RATE_LIMITED, message, 429);
  }
}

/** 提取客户端 IP（信任反向代理头，落到 socket 地址兜底） */
export function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}
