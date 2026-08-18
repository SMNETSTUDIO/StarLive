import "dotenv/config";

function env(key: string, def = ""): string {
  return process.env[key] ?? def;
}

function envInt(key: string, def: number): number {
  const v = parseInt(env(key, String(def)), 10);
  return Number.isFinite(v) ? v : def;
}

export const config = {
  port: envInt("PORT", 3000),
  appBaseUrl: env("APP_BASE_URL", "http://localhost:3000"),

  // 前端构建产物目录（留空则默认 apps/web/dist）
  webDist: env("WEB_DIST", ""),
  // 单端口部署时 /hls 转发目标（MediaMTX HLS 服务）
  hlsProxyTarget: env("HLS_PROXY_TARGET", "http://localhost:8888"),

  redisUrl: env("REDIS_URL", "redis://localhost:6379"),

  jwtSecret: env("JWT_SECRET", "dev-secret-change-me"),
  sessionTtl: envInt("SESSION_TTL", 604800),
  sessionCookie: "session",
  viewerCookie: "viewer_session",
  // 前端与 API 跨站部署时设 COOKIE_SAMESITE=none（要求 https）
  cookieSameSite: env("COOKIE_SAMESITE", "lax") as "lax" | "none" | "strict",
  cookieSecure: env("COOKIE_SECURE", "") === "true",

  oauthProviderName: env("OAUTH_PROVIDER_NAME", "OAuth"),
  oauthClientId: env("OAUTH_CLIENT_ID", ""),
  oauthClientSecret: env("OAUTH_CLIENT_SECRET", ""),
  oauthRedirectUri: env("OAUTH_REDIRECT_URI", ""),
  oauthAuthUrl: env("OAUTH_AUTH_URL", "https://connect.linux.do/oauth2/authorize"),
  oauthTokenUrl: env("OAUTH_TOKEN_URL", "https://connect.linux.do/oauth2/token"),
  oauthUserInfoUrl: env("OAUTH_USERINFO_URL", "https://connect.linux.do/api/user"),

  streamProvider: env("STREAM_PROVIDER", "selfhosted"),
  mediamtxApi: env("MEDIAMTX_API", "http://localhost:9997"),
  mediamtxAuthHook: env("MEDIAMTX_AUTH_HOOK", "http://localhost:3000/api/stream/hook"),

  ffmpegPath: env("FFMPEG_PATH", "ffmpeg"),
  recordingDir: env("RECORDING_DIR", "./recordings"),

  epayPid: env("EPAY_PID", ""),
  epayKey: env("EPAY_KEY", ""),
  epayGateway: env("EPAY_GATEWAY", ""),

  alipayAppId: env("ALIPAY_APP_ID", ""),
  alipayPrivateKey: env("ALIPAY_PRIVATE_KEY", ""),
  alipayPublicKey: env("ALIPAY_PUBLIC_KEY", ""),
  alipayGateway: env("ALIPAY_GATEWAY", "https://openapi.alipay.com/gateway.do"),

  stripeSecretKey: env("STRIPE_SECRET_KEY", ""),
  stripeWebhookSecret: env("STRIPE_WEBHOOK_SECRET", ""),
  // Stripe 计费货币：订单金额（元）按该货币单位直接计费
  stripeCurrency: env("STRIPE_CURRENCY", "usd").toLowerCase(),

  // mock 支付网关：可无条件入账，仅限沙箱联调；生产环境需显式开启
  paymentMockEnabled:
    env("PAYMENT_MOCK_ENABLED", "") === "true" || env("NODE_ENV", "development") !== "production",

  adminUserIds: env("ADMIN_USER_IDS", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
} as const;
