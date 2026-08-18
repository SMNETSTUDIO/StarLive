/**
 * Redis key 约定（集中管理，避免散落字符串）
 */
export const Keys = {
  // 用户
  user: (id: string) => `user:${id}`,
  usersSet: "users:set",
  userByUsername: (username: string) => `user:index:username:${username.toLowerCase()}`,
  userByEmail: (email: string) => `user:index:email:${email.toLowerCase()}`,
  userBalance: (id: string) => `user:balance:${id}`,
  userTransaction: (id: string, txId: string) => `user:transaction:${id}:${txId}`,
  userTransactionsIndex: (id: string) => `user:transactions:index:${id}`,
  userDistribute: (id: string) => `user:distribute:${id}`,
  userWithdrawals: (id: string) => `user:withdrawals:${id}`,
  userOrders: (id: string) => `user:orders:${id}`,
  userFollowing: (id: string) => `user:following:${id}`,
  userFollowers: (id: string) => `user:followers:${id}`,

  // 房间
  room: (roomId: string) => `room:${roomId}`,
  roomsSet: "rooms:set",
  publicRoomsSet: "publicRooms:set",
  userRooms: (userId: string) => `userRooms:${userId}`,
  categoryRooms: (category: string) => `category:${category}`,
  roomModerators: (roomId: string) => `room:${roomId}:moderators`,
  roomViewers: (roomId: string) => `room:${roomId}:viewers`,
  roomViewersUser: (roomId: string) => `room:${roomId}:viewers:u`,
  roomViewersGuest: (roomId: string) => `room:${roomId}:viewers:g`,
  roomMuted: (roomId: string, userId: string) => `room:${roomId}:muted:${userId}`,
  roomModerationLog: (roomId: string) => `room:${roomId}:moderation:log`,

  // 弹幕
  danmakuZset: (roomId: string) => `danmaku:z:${roomId}`,
  danmakuLastUpdate: (roomId: string) => `danmaku:${roomId}:lastUpdate`,

  // 礼物
  giftDef: (id: string) => `gift:def:${id}`,
  giftsActive: "gifts:active",
  rewardRecord: (id: string) => `reward:record:${id}`,
  roomRewards: (roomId: string) => `room:rewards:${roomId}`,

  // 抽奖
  lottery: (id: string) => `lottery:${id}`,
  lotteryParticipants: (id: string) => `lottery:${id}:participants`,
  roomActiveLottery: (roomId: string) => `room:${roomId}:active_lottery`,
  roomLotteries: (roomId: string) => `room:${roomId}:lotteries`,

  // 红包
  redpacket: (id: string) => `redpacket:${id}`,
  redpacketClaims: (id: string) => `redpacket:claims:${id}`,
  roomRedpackets: (roomId: string) => `room:redpackets:${roomId}`,

  // 支付 / 提现
  paymentOrder: (orderId: string) => `payment:order:${orderId}`,
  paymentOutTradeNo: (no: string) => `payment:out_trade_no:${no}`,
  paymentOrdersByStatus: (status: string) => `payment:orders:by_status:${status}`,
  paymentConfig: (provider: string) => `payment:config:${provider}`,
  withdrawalRequest: (id: string) => `withdrawal:request:${id}`,
  withdrawalsByStatus: (status: string) => `withdrawals:by_status:${status}`,

  // 录播
  recording: (id: string) => `recording:${id}`,
  recordingShare: (token: string) => `recording:share:${token}`,
  recordingShareList: (roomId: string) => `recording:share:list:${roomId}`,

  // 系统 / 管理
  systemConfig: "system:config",
  systemSetupDone: "system:setup_done",
  systemFeatures: "system:features",
  adminUserRoles: "admin:user_roles",
  adminRoles: "admin:roles",
  adminSensitiveWords: "admin:sensitive_words",
  adminAuditLog: "admin:audit:log",

  // 队列 / 锁
  queueRecording: "queue:recording",
  queueTranscode: "queue:transcode",
  lock: (name: string) => `lock:${name}`,
} as const;
