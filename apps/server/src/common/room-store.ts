import type { Room, RoomStatus } from "@starlive/shared";
import { Keys } from "@starlive/shared";
import { invalidateCache } from "./cache";
import { EVT, publishEvent } from "./event-bus";
import { redis, redisPipeline } from "./redis";

export const VIEWER_TTL_MS = 20_000;

export async function getRoom(roomId: string): Promise<Room | null> {
  const raw = await redis().hgetall(Keys.room(roomId));
  if (!raw || !raw.id) return null;
  return {
    id: raw.id,
    title: raw.title ?? "",
    announcement: raw.announcement ?? "",
    ownerId: raw.ownerId ?? "",
    isPublic: raw.isPublic === "true" || raw.isPublic === "1",
    passwordHash: raw.passwordHash ?? undefined,
    category: raw.category ?? undefined,
    tags: raw.tags ? safeParseTags(raw.tags) : [],
    status: (raw.status as RoomStatus) ?? "idle",
    streamId: raw.streamId ?? undefined,
    streamKey: raw.streamKey ?? undefined,
    playbackId: raw.playbackId ?? undefined,
    playbackUrl: raw.playbackUrl ?? undefined,
    provider: raw.provider ?? undefined,
    banned: raw.banned === "true" || raw.banned === "1",
    createdAt: Number(raw.createdAt ?? 0),
  };
}

function safeParseTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function setRoomField(
  roomId: string,
  field: string,
  value: string,
): Promise<void> {
  await redis().hset(Keys.room(roomId), field, value);
}

export async function setRoomStatus(
  roomId: string,
  status: RoomStatus,
): Promise<void> {
  await redis().hset(Keys.room(roomId), "status", status);
  // 开播/下播立即反映到列表（绕过列表 3s 缓存）
  invalidateCache("rooms:list:");
  publishEvent(EVT.ROOM_STATUS, { roomId, status, ts: Date.now() });
}

export async function mapStreamKeyToRoomId(streamKey: string): Promise<string | null> {
  return redis().get(`stream:key:${streamKey}`);
}

export async function bindStreamKey(streamKey: string, roomId: string): Promise<void> {
  await redis().set(`stream:key:${streamKey}`, roomId);
}

export interface ViewerCounts {
  viewerCount: number;
  registeredCount: number;
  guestCount: number;
}

/** 单房间在线人数：4 条命令合并为一次 pipeline 往返 */
export async function countViewers(roomId: string): Promise<ViewerCounts> {
  const map = await countViewersBatch([roomId]);
  return map.get(roomId)!;
}

/** 批量在线人数：N 个房间共 4N 条命令，仍只有一次往返（远程 Redis 关键优化） */
export async function countViewersBatch(roomIds: string[]): Promise<Map<string, ViewerCounts>> {
  const out = new Map<string, ViewerCounts>();
  if (roomIds.length === 0) return out;
  const now = Date.now();
  const min = now - VIEWER_TTL_MS;
  const res = await redisPipeline<number>((p) => {
    for (const id of roomIds) {
      p.zremrangebyscore(Keys.roomViewersUser(id), "-inf", min);
      p.zremrangebyscore(Keys.roomViewersGuest(id), "-inf", min);
      p.zcount(Keys.roomViewersUser(id), min, "+inf");
      p.zcount(Keys.roomViewersGuest(id), min, "+inf");
    }
  });
  roomIds.forEach((id, i) => {
    const u = res[i * 4 + 2] ?? 0;
    const g = res[i * 4 + 3] ?? 0;
    out.set(id, { viewerCount: u + g, registeredCount: u, guestCount: g });
  });
  return out;
}

export async function heartbeatViewer(
  roomId: string,
  identity: { userId?: string; guestId?: string },
): Promise<ViewerCounts> {
  const now = Date.now();
  const min = now - VIEWER_TTL_MS;
  const key = identity.userId
    ? Keys.roomViewersUser(roomId)
    : Keys.roomViewersGuest(roomId);
  const member = identity.userId ?? identity.guestId ?? "unknown";
  // 写入 + 清理 + 统计合并为一次往返
  const res = await redisPipeline<number>((p) => {
    p.zadd(key, now, member);
    p.zremrangebyscore(Keys.roomViewersUser(roomId), "-inf", min);
    p.zremrangebyscore(Keys.roomViewersGuest(roomId), "-inf", min);
    p.zcount(Keys.roomViewersUser(roomId), min, "+inf");
    p.zcount(Keys.roomViewersGuest(roomId), min, "+inf");
  });
  const u = res[3] ?? 0;
  const g = res[4] ?? 0;
  const counts = { viewerCount: u + g, registeredCount: u, guestCount: g };
  // presence 随每个观众心跳触发（N 人 = N 次/10s）：人数未变且 3s 内已广播过则跳过，
  // 大房间的 ws 广播量从 O(N²) 降到 O(N)
  const last = lastPresence.get(roomId);
  if (!last || last.viewerCount !== counts.viewerCount || now - last.ts > 3000) {
    lastPresence.set(roomId, { viewerCount: counts.viewerCount, ts: now });
    publishEvent(EVT.PRESENCE, { roomId, ...counts });
  }
  return counts;
}

const lastPresence = new Map<string, { viewerCount: number; ts: number }>();
