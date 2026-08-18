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

  adminUserIds: env("ADMIN_USER_IDS", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
} as const;
