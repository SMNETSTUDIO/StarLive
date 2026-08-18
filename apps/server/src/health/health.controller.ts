import { Controller, Get } from "@nestjs/common";
import { redis } from "../common/redis";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

@Controller("health")
export class HealthController {
  @Get()
  async check() {
    let redisStatus = "down";
    try {
      await withTimeout(redis().ping(), 2000);
      redisStatus = "up";
    } catch {
      redisStatus = "down";
    }
    return { status: "ok", redis: redisStatus, ts: Date.now() };
  }
}
