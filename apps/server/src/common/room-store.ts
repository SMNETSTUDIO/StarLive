import type { Room, RoomStatus } from "@starlive/shared";
import { Keys } from "@starlive/shared";
import { EVT, publishEvent } from "./event-bus";
import { redis } from "./redis";

const VIEWER_TTL_MS = 20_000;

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
  publishEvent(EVT.ROOM_STATUS, { roomId, status, ts: Date.now() });
}

export async function mapStreamKeyToRoomId(streamKey: string): Promise<string | null> {
  return redis().get(`stream:key:${streamKey}`);
}

export async function bindStreamKey(streamKey: string, roomId: string): Promise<void> {
  await redis().set(`stream:key:${streamKey}`, roomId);
}

export async function countViewers(roomId: string): Promise<{
  viewerCount: number;
  registeredCount: number;
  guestCount: number;
}> {
  const r = redis();
  const now = Date.now();
  const min = now - VIEWER_TTL_MS;
  await r.zremrangebyscore(Keys.roomViewersUser(roomId), "-inf", min);
  await r.zremrangebyscore(Keys.roomViewersGuest(roomId), "-inf", min);
  const u = await r.zcount(Keys.roomViewersUser(roomId), min, "+inf");
  const g = await r.zcount(Keys.roomViewersGuest(roomId), min, "+inf");
  return { viewerCount: u + g, registeredCount: u, guestCount: g };
}

export async function heartbeatViewer(
  roomId: string,
  identity: { userId?: string; guestId?: string },
): Promise<{ viewerCount: number; registeredCount: number; guestCount: number }> {
  const r = redis();
  const now = Date.now();
  const key = identity.userId
    ? Keys.roomViewersUser(roomId)
    : Keys.roomViewersGuest(roomId);
  const member = identity.userId ?? identity.guestId ?? "unknown";
  await r.zadd(key, now, member);
  const counts = await countViewers(roomId);
  publishEvent(EVT.PRESENCE, { roomId, ...counts });
  return counts;
}
