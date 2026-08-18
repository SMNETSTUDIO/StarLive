/**
 * 核心领域类型
 */

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  banned: boolean;
  muted: boolean;
  isSuperAdmin?: boolean;
  roleId?: string;
  permissions?: string[];
}

export type RoomStatus = "idle" | "connected" | "active";

export interface Room {
  id: string;
  title: string;
  announcement?: string;
  ownerId: string;
  isPublic: boolean;
  passwordHash?: string;
  category?: string;
  tags?: string[];
  status: RoomStatus;
  streamId?: string;
  streamKey?: string;
  playbackId?: string;
  playbackUrl?: string;
  provider?: string;
  banned: boolean;
  createdAt: number;
}

export interface Balance {
  coins: number;
  totalRecharged: number;
  totalWithdrawn: number;
  frozenCoins: number;
}

export type TransactionType =
  | "recharge"
  | "gift_send"
  | "gift_receive"
  | "redpacket_send"
  | "redpacket_receive"
  | "withdrawal"
  | "admin_adjust";

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  meta?: string;
  ts: number;
}

export interface GiftDefinition {
  id: string;
  name: string;
  icon?: string;
  price: number;
}

export type RedpacketMode = "random" | "equal";

export interface Redpacket {
  id: string;
  roomId: string;
  senderId: string;
  total: number;
  count: number;
  mode: RedpacketMode;
  createdAt: number;
  expiresAt: number;
}

export interface Lottery {
  id: string;
  roomId: string;
  ownerId: string;
  title: string;
  winnerCount: number;
  startedAt: number;
  endsAt: number;
  drawn: boolean;
}

export type PaymentOrderStatus = "pending" | "paid" | "failed" | "refunded";

export interface PaymentOrder {
  id: string;
  userId: string;
  amount: number;
  coins: number;
  provider: string;
  status: PaymentOrderStatus;
  createdAt: number;
}

export type WithdrawalStatus = "pending" | "processing" | "completed" | "rejected";

export interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: number;
  fee: number;
  status: WithdrawalStatus;
  createdAt: number;
}

export interface SystemFeatures {
  maintenanceEnabled: boolean;
  maintenanceMessage?: string;
  registrationEnabled: boolean;
  recordingEnabled: boolean;
  transcodingEnabled: boolean;
  lotteryEnabled: boolean;
  publicListEnabled: boolean;
}

/** StreamProvider 抽象 */
export interface StreamProvider {
  readonly name: string;
  createStream(input: { title: string; roomId: string }): Promise<{
    streamId: string;
    streamKey: string;
    playbackId: string;
    playbackUrl?: string;
  }>;
  getStream(streamId: string): Promise<{ status: RoomStatus }>;
  deleteStream(streamId: string): Promise<void>;
  listRecordings(streamId: string): Promise<RecordingAsset[]>;
}

export interface RecordingAsset {
  id: string;
  streamId: string;
  duration?: number;
  createdAt: number;
  downloadUrl?: string;
}

/** PaymentProvider 抽象 */
export interface PaymentProvider {
  readonly name: string;
  createOrder(order: {
    orderId: string;
    amount: number;
    coins: number;
    subject: string;
  }): Promise<PayResult>;
  verifyCallback(payload: unknown): Promise<VerifiedPayment>;
  queryOrder(orderId: string): Promise<PaymentOrderStatus>;
  refund(orderId: string): Promise<void>;
}

export interface PayResult {
  type: "form" | "url" | "qrcode";
  payload: string;
}

export interface VerifiedPayment {
  orderId: string;
  amount: number;
  providerTradeNo: string;
}
