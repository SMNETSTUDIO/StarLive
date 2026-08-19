import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { createHash } from "crypto";
import { Server, Socket } from "socket.io";
import type { JoinRoomPayload } from "@starlive/shared";
import { WS_EVENTS } from "@starlive/shared";
import { config } from "../config/config";
import { EVT, eventBus } from "../common/event-bus";
import { verifyJwt } from "../common/jwt";
import { getRoom } from "../common/room-store";

function roomKey(roomId: string): string {
  return `room:${roomId}`;
}

function hashPassword(pwd: string): string {
  return createHash("sha256").update(pwd).digest("hex");
}

/** 从 Socket.IO 握手 Cookie 中解析登录用户 ID（未登录返回 undefined） */
async function resolveUserId(client: Socket): Promise<string | undefined> {
  const header = client.handshake.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name !== config.sessionCookie) continue;
    const token = decodeURIComponent(part.slice(idx + 1).trim());
    const payload = await verifyJwt(token);
    return payload?.sub;
  }
  return undefined;
}

@WebSocketGateway({ cors: { origin: "*", credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  onModuleInit(): void {
    // 订阅业务事件总线 → 广播到对应房间（事件名与 EVT 一致）
    for (const eventName of Object.values(EVT)) {
      eventBus.on(eventName, (payload: { roomId?: string }) => {
        if (payload?.roomId) {
          this.emitToRoom(payload.roomId, eventName, payload);
        }
      });
    }
  }

  handleConnection(client: Socket): void {
    void client;
  }

  handleDisconnect(client: Socket): void {
    void client;
  }

  @SubscribeMessage(WS_EVENTS.JOIN_ROOM)
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ): Promise<void> {
    const room = await getRoom(payload.roomId);
    if (!room || room.banned) {
      client.emit("join_denied", { roomId: payload.roomId, reason: "unavailable" });
      return;
    }
    // 私密房间：校验密码（房主豁免）
    if (room.passwordHash) {
      const userId = await resolveUserId(client);
      const isOwner = userId !== undefined && userId === room.ownerId;
      const passwordOk =
        typeof payload.password === "string" &&
        hashPassword(payload.password) === room.passwordHash;
      if (!isOwner && !passwordOk) {
        client.emit("join_denied", { roomId: payload.roomId, reason: "password" });
        return;
      }
    }
    client.join(roomKey(payload.roomId));
    client.data.roomId = payload.roomId;
  }

  @SubscribeMessage(WS_EVENTS.LEAVE_ROOM)
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ): void {
    client.leave(roomKey(payload.roomId));
    client.data.roomId = undefined;
  }

  @SubscribeMessage(WS_EVENTS.HEARTBEAT)
  handleHeartbeat(@ConnectedSocket() client: Socket): void {
    client.emit("pong", { ts: Date.now() });
  }

  emitToRoom(roomId: string, event: string, data: unknown): void {
    this.server.to(roomKey(roomId)).emit(event, data);
  }
}
