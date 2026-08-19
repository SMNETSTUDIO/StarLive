import { Injectable } from "@nestjs/common";
import { randomBytes } from "crypto";
import type {
  RecordingAsset,
  RoomStatus,
  StreamProvider,
} from "@starlive/shared";
import { ErrorCode } from "@starlive/shared";
import { cached, invalidateCache } from "../common/cache";
import { BizException } from "../common/errors";
import { getAppBaseUrl, runtimeConfig } from "../common/runtime-config";
import { config } from "../config/config";

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

class SelfHostedProvider implements StreamProvider {
  readonly name = "selfhosted";

  async createStream(input: { title: string; roomId: string }) {
    const streamKey = `room_${input.roomId}_${randomBytes(8).toString("hex")}`;
    return {
      streamId: streamKey,
      streamKey,
      playbackId: streamKey,
      playbackUrl: `${await getAppBaseUrl()}/hls/${streamKey}/index.m3u8`,
    };
  }

  async getStream(streamId: string): Promise<{ status: RoomStatus }> {
    return cached(`stream:status:${streamId}`, 5000, async () => {
      let res: Response;
      try {
        res = await fetchWithTimeout(
          `${config.mediamtxApi}/v3/paths/get/${streamId}`,
          3000,
        );
      } catch {
        // 推流服务不可达：抛出以保留现有房间状态，避免误判为 idle
        throw new Error("mediamtx unreachable");
      }
      if (res.status === 404) return { status: "idle" as RoomStatus };
      if (!res.ok) throw new Error("mediamtx error");
      const data = (await res.json()) as { ready?: boolean };
      return { status: data.ready ? ("active" as RoomStatus) : ("idle" as RoomStatus) };
    });
  }

  async deleteStream(streamId: string): Promise<void> {
    try {
      await fetchWithTimeout(`${config.mediamtxApi}/v3/paths/delete/${streamId}`, 3000);
    } catch {
      /* ignore */
    }
    invalidateCache(`stream:status:${streamId}`);
  }

  async listRecordings(streamId: string): Promise<RecordingAsset[]> {
    void streamId;
    return [];
  }
}

/** Mux Video（直播 + 点播回放），REST 直连零 SDK；凭据后台面板优先、环境变量兜底 */
class MuxProvider implements StreamProvider {
  readonly name = "mux";
  private static readonly API = "https://api.mux.com";

  private async authHeader(): Promise<string> {
    const [id, secret] = await Promise.all([
      runtimeConfig("mux_token_id"),
      runtimeConfig("mux_token_secret"),
    ]);
    if (!id || !secret) {
      throw new BizException(
        ErrorCode.INTERNAL,
        "Mux 未配置：请在后台「系统设置 → 直播流服务」填写 Token，或切回自建 MediaMTX",
      );
    }
    return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  }

  private async api<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(`${MuxProvider.API}${path}`, {
      method,
      headers: {
        Authorization: await this.authHeader(),
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) {
      throw Object.assign(new Error("mux: not found"), { status: 404 });
    }
    if (res.status === 204) return undefined as T;
    const data = (await res.json().catch(() => ({}))) as {
      data?: T;
      error?: { messages?: string[] };
    };
    if (!res.ok) {
      throw new BizException(
        ErrorCode.INTERNAL,
        `Mux：${data.error?.messages?.join("; ") ?? res.statusText}`,
      );
    }
    return data.data as T;
  }

  async createStream(input: { title: string; roomId: string }) {
    const stream = await this.api<{
      id: string;
      stream_key: string;
      playback_ids?: { id: string }[];
    }>("POST", "/video/v1/live-streams", {
      playback_policy: ["public"],
      new_asset_settings: { playback_policy: ["public"] },
      passthrough: input.roomId,
    });
    const playbackId = stream.playback_ids?.[0]?.id ?? "";
    return {
      streamId: stream.id,
      streamKey: stream.stream_key,
      playbackId,
      playbackUrl: playbackId ? `https://stream.mux.com/${playbackId}.m3u8` : undefined,
    };
  }

  async getStream(streamId: string): Promise<{ status: RoomStatus }> {
    return cached(`stream:status:${streamId}`, 5000, async () => {
      try {
        const s = await this.api<{ status?: string }>(
          "GET",
          `/video/v1/live-streams/${encodeURIComponent(streamId)}`,
        );
        return { status: s.status === "active" ? ("active" as RoomStatus) : ("idle" as RoomStatus) };
      } catch (e) {
        if ((e as { status?: number }).status === 404) return { status: "idle" as RoomStatus };
        throw e;
      }
    });
  }

  async deleteStream(streamId: string): Promise<void> {
    try {
      await this.api("DELETE", `/video/v1/live-streams/${encodeURIComponent(streamId)}`);
    } catch {
      /* ignore */
    }
    invalidateCache(`stream:status:${streamId}`);
  }

  /** 直播产生的点播资产（Mux 自动录制） */
  async listRecordings(streamId: string): Promise<RecordingAsset[]> {
    const assets = await this.api<
      {
        id: string;
        duration?: number;
        created_at?: string;
        playback_ids?: { id: string }[];
      }[]
    >("GET", `/video/v1/assets?live_stream_id=${encodeURIComponent(streamId)}&limit=50`);
    return (assets ?? []).map((a) => ({
      id: a.id,
      streamId,
      duration: a.duration,
      createdAt: Number(a.created_at ?? 0) * 1000,
      downloadUrl: a.playback_ids?.[0]?.id
        ? `https://stream.mux.com/${a.playback_ids[0].id}.m3u8`
        : undefined,
    }));
  }
}

@Injectable()
export class StreamService {
  private readonly providers: Record<string, StreamProvider>;

  constructor() {
    this.providers = {
      selfhosted: new SelfHostedProvider(),
      mux: new MuxProvider(),
    };
  }

  /** 当前 Provider：后台面板（system:config.stream_provider）优先，环境变量兜底；只影响新建房间 */
  async getProvider(): Promise<StreamProvider> {
    const name = await runtimeConfig("stream_provider");
    return this.providers[name] ?? this.providers.selfhosted;
  }

  /** 按名称取 Provider：已有房间沿用创建时记录的 provider，切换全局配置不影响存量房间 */
  byName(name?: string): StreamProvider {
    return this.providers[name ?? ""] ?? this.providers.selfhosted;
  }

  async createStream(input: { title: string; roomId: string }) {
    return (await this.getProvider()).createStream(input);
  }

  getStream(streamId: string, providerName?: string) {
    return this.byName(providerName).getStream(streamId);
  }

  deleteStream(streamId: string, providerName?: string) {
    return this.byName(providerName).deleteStream(streamId);
  }

  listRecordings(streamId: string, providerName?: string) {
    return this.byName(providerName).listRecordings(streamId);
  }
}
