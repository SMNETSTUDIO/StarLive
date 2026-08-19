import { EventEmitter } from "events";
import type {
  DanmakuMessage,
  GiftMessage,
  LotteryDrawnMessage,
  LotteryMessage,
  PresenceMessage,
  RedpacketClaimedMessage,
  RedpacketMessage,
  RoomStatusMessage,
} from "@starlive/shared";
import { WS_EVENTS } from "@starlive/shared";

export const EVT = {
  DANMAKU: WS_EVENTS.DANMAKU,
  GIFT: WS_EVENTS.GIFT,
  PRESENCE: WS_EVENTS.PRESENCE,
  ROOM_STATUS: WS_EVENTS.ROOM_STATUS,
  REDPACKET_CREATED: WS_EVENTS.REDPACKET_CREATED,
  REDPACKET_CLAIMED: WS_EVENTS.REDPACKET_CLAIMED,
  LOTTERY_STARTED: WS_EVENTS.LOTTERY_STARTED,
  LOTTERY_JOINED: WS_EVENTS.LOTTERY_JOINED,
  LOTTERY_DRAWN: WS_EVENTS.LOTTERY_DRAWN,
  MUTE: WS_EVENTS.MUTE,
  SYSTEM_RELOAD: WS_EVENTS.SYSTEM_RELOAD,
} as const;

export interface EventPayloads {
  [EVT.DANMAKU]: DanmakuMessage;
  [EVT.GIFT]: GiftMessage;
  [EVT.PRESENCE]: PresenceMessage;
  [EVT.ROOM_STATUS]: RoomStatusMessage;
  [EVT.REDPACKET_CREATED]: RedpacketMessage;
  [EVT.REDPACKET_CLAIMED]: RedpacketClaimedMessage;
  [EVT.LOTTERY_STARTED]: LotteryMessage;
  [EVT.LOTTERY_JOINED]: LotteryMessage;
  [EVT.LOTTERY_DRAWN]: LotteryDrawnMessage;
  [EVT.MUTE]: { roomId: string; userId?: string; guestId?: string; durationSec?: number };
  [EVT.SYSTEM_RELOAD]: { reason: string; ts: number };
}

/**
 * 进程内事件总线：业务模块 publish，RealtimeGateway 订阅后广播到 Socket.IO 房间。
 */
export const eventBus = new EventEmitter();

export function publishEvent<K extends keyof EventPayloads>(
  event: K,
  payload: EventPayloads[K],
): void {
  eventBus.emit(event, payload);
}
