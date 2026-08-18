/**
 * 统一错误码（业务错误通过 HTTP 200 + code 返回，或 WS 事件携带）
 */
export const ErrorCode = {
  OK: 0,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,

  BANNED: 1001,
  ROOM_BANNED: 1002,
  MUTED: 1003,
  ROOM_MUTED: 1004,

  INSUFFICIENT_BALANCE: 2001,
  INVALID_AMOUNT: 2002,
  WITHDRAW_BELOW_MIN: 2003,

  ROOM_PASSWORD_REQUIRED: 3001,
  ROOM_PASSWORD_WRONG: 3002,

  RATE_LIMITED: 4001,
  SENSITIVE_WORD: 4002,

  PAYMENT_VERIFY_FAILED: 5001,
  ORDER_ALREADY_PAID: 5002,
  /** 网关回调中的无关事件（如 Stripe 非支付完成事件），应答 2xx 忽略 */
  PAYMENT_CALLBACK_IGNORED: 5102,

  DUPLICATE_CLAIM: 6001,
  REDPACKET_EXPIRED: 6002,
  REDPACKET_EMPTY: 6003,

  LOTTERY_NOT_ACTIVE: 7001,
  ALREADY_JOINED: 7002,

  INTERNAL: 5000,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiResponse<T = unknown> {
  code: ErrorCodeValue;
  message: string;
  data?: T;
}
