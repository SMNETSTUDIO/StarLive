import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import type { JoinRoomPayload } from "@starlive/shared";
import { WS_EVENTS } from "@starlive/shared";
import { EVT, eventBus } from "../common/event-bus";

function roomKey(roomId: string): string {
  return `room:${roomId}`;
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
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ): void {
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
