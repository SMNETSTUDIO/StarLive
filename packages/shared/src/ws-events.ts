/**
 * WebSocket 事件协议（客户端与服务端共享）
 */

export const WS_EVENTS = {
  // 客户端 → 服务端
  JOIN_ROOM: "join_room",
  LEAVE_ROOM: "leave_room",
  HEARTBEAT: "heartbeat",

  // 服务端 → 客户端
  DANMAKU: "danmaku",
  GIFT: "gift",
  REDPACKET_CREATED: "redpacket.created",
  REDPACKET_CLAIMED: "redpacket.claimed",
  LOTTERY_STARTED: "lottery.started",
  LOTTERY_JOINED: "lottery.joined",
  LOTTERY_DRAWN: "lottery.drawn",
  PRESENCE: "presence",
  ROOM_STATUS: "room.status",
  MUTE: "mute",
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

/** 弹幕消息 */
export interface DanmakuMessage {
  id: string;
  roomId: string;
  userId?: string;
  guestId?: string;
  name: string;
  avatar?: string;
  color?: string;
  content: string;
  ts: number;
}

/** 礼物事件 */
export interface GiftMessage {
  id: string;
  roomId: string;
  fromUserId?: string;
  fromName: string;
  fromAvatar?: string;
  giftId: string;
  giftName: string;
  giftIcon?: string;
  count: number;
  price: number;
  ts: number;
}

/** 在线人数 */
export interface PresenceMessage {
  roomId: string;
  viewerCount: number;
  registeredCount: number;
  guestCount: number;
}

/** 房间状态变更 */
export interface RoomStatusMessage {
  roomId: string;
  status: "idle" | "connected" | "active";
  ts: number;
}

/** 红包事件 */
export interface RedpacketMessage {
  id: string;
  roomId: string;
  total: number;
  count: number;
  mode: "random" | "equal";
  ts: number;
}

export interface RedpacketClaimedMessage {
  redpacketId: string;
  roomId: string;
  userName: string;
  amount: number;
  ts: number;
}

/** 抽奖事件 */
export interface LotteryMessage {
  id: string;
  roomId: string;
  title: string;
  winnerCount: number;
  ts: number;
}

export interface LotteryDrawnMessage {
  id: string;
  roomId: string;
  winners: string[];
  /** 中奖者用户名（弹窗展示用） */
  winnerNames?: string[];
  participants?: number;
  ts: number;
}

/** 客户端 → 服务端 载荷 */
export interface JoinRoomPayload {
  roomId: string;
  password?: string;
}
