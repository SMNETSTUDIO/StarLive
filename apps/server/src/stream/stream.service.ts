import { Injectable } from "@nestjs/common";
import { randomBytes } from "crypto";
import type {
  RecordingAsset,
  RoomStatus,
  StreamProvider,
} from "@starlive/shared";
import { cached, invalidateCache } from "../common/cache";
import { getAppBaseUrl } from "../common/runtime-config";
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

class MuxProvider implements StreamProvider {
  readonly name = "mux";

  private notConfigured(): never {
    throw new Error(
      "Mux provider not configured. Set STREAM_PROVIDER=selfhosted or provide MUX_TOKEN_ID/MUX_TOKEN_SECRET.",
    );
  }

  async createStream(): Promise<never> {
    this.notConfigured();
  }

  async getStream(): Promise<never> {
    this.notConfigured();
  }

  async deleteStream(): Promise<never> {
    this.notConfigured();
  }

  async listRecordings(): Promise<never> {
    this.notConfigured();
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

  get provider(): StreamProvider {
    return this.providers[config.streamProvider] ?? this.providers.selfhosted;
  }

  createStream(input: { title: string; roomId: string }) {
    return this.provider.createStream(input);
  }

  getStream(streamId: string) {
    return this.provider.getStream(streamId);
  }

  deleteStream(streamId: string) {
    return this.provider.deleteStream(streamId);
  }

  listRecordings(streamId: string) {
    return this.provider.listRecordings(streamId);
  }
}
