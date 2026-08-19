import { Injectable } from "@nestjs/common";
import { spawn } from "child_process";
import { ErrorCode } from "@starlive/shared";
import { BizException } from "../common/errors";
import { getRoom } from "../common/room-store";
import { config } from "../config/config";

const TTL_MS = 20_000;
const TIMEOUT_MS = 10_000;
const MAX_CACHE = 200;

/**
 * 自建 MediaMTX 直播封面：ffmpeg 从 HLS 源抓一帧 JPEG。
 * 内存缓存 20s + 并发去重，同一房间高频访问只起一个 ffmpeg。
 */
@Injectable()
export class ThumbnailService {
  private cache = new Map<string, { buf: Buffer; ts: number }>();
  private pending = new Map<string, Promise<Buffer>>();

  async capture(roomId: string): Promise<Buffer> {
    const room = await getRoom(roomId);
    // Mux 房间由前端直连 image.mux.com，本接口仅服务自建流
    if (!room || room.status !== "active" || !room.streamKey || room.provider === "mux") {
      throw new BizException(ErrorCode.NOT_FOUND, "房间未开播", 404);
    }

    const hit = this.cache.get(roomId);
    if (hit && Date.now() - hit.ts < TTL_MS) return hit.buf;

    let job = this.pending.get(roomId);
    if (!job) {
      const src = `${config.hlsProxyTarget}/${room.streamKey}/index.m3u8`;
      job = this.grab(src)
        .then((buf) => {
          if (this.cache.size >= MAX_CACHE) {
            for (const [k, v] of this.cache) if (Date.now() - v.ts >= TTL_MS) this.cache.delete(k);
          }
          this.cache.set(roomId, { buf, ts: Date.now() });
          return buf;
        })
        .finally(() => this.pending.delete(roomId));
      this.pending.set(roomId, job);
    }
    return job;
  }

  private grab(src: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const ff = spawn(
        config.ffmpegPath,
        [
          "-hide_banner",
          "-loglevel", "error",
          "-i", src,
          "-frames:v", "1",
          "-vf", "scale=640:-2",
          "-q:v", "5",
          "-f", "mjpeg",
          "pipe:1",
        ],
        { stdio: ["ignore", "pipe", "ignore"] },
      );
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => ff.kill("SIGKILL"), TIMEOUT_MS);
      ff.stdout.on("data", (c: Buffer) => chunks.push(c));
      ff.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      ff.on("close", (code) => {
        clearTimeout(timer);
        const buf = Buffer.concat(chunks);
        if (code === 0 && buf.length > 0) resolve(buf);
        else reject(new Error(`ffmpeg exited ${code}`));
      });
    });
  }
}
