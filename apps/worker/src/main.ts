import "dotenv/config";
import { Redis } from "ioredis";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const QUEUES = ["queue:recording", "queue:transcode"] as const;
const FFMPEG_PATH = process.env.FFMPEG_PATH ?? "ffmpeg";
const RECORDING_DIR = process.env.RECORDING_DIR ?? "./recordings";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: 3,
});

interface Job {
  type: "recording" | "transcode";
  roomId: string;
  streamKey: string;
  outputPath?: string;
}

function parseJob(raw: string): Job | null {
  try {
    return JSON.parse(raw) as Job;
  } catch {
    return null;
  }
}

async function runRecording(job: Job): Promise<void> {
  const output = `${RECORDING_DIR}/${job.roomId}_${Date.now()}.ts`;
  const args = ["-i", `rtmp://mediamtx:1935/${job.streamKey}`, "-c", "copy", output];
  // eslint-disable-next-line no-console
  console.log(`[recording] start ${job.roomId} -> ${output}`);
  await execFileAsync(FFMPEG_PATH, args);
}

async function runTranscode(job: Job): Promise<void> {
  // P1 接入多码率转码
  void job;
}

async function processJob(raw: string): Promise<void> {
  const job = parseJob(raw);
  if (!job) return;
  if (job.type === "recording") await runRecording(job);
  else if (job.type === "transcode") await runTranscode(job);
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`StarLive worker started (queues: ${QUEUES.join(", ")})`);

  while (true) {
    // BRPOP 阻塞消费，超时 5s 后继续循环
    const res = await redis.brpop(...QUEUES, 5);
    if (!res) continue;
    const [, raw] = res;
    try {
      await processJob(raw);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[worker] job failed", err);
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[worker] fatal", err);
  process.exit(1);
});
