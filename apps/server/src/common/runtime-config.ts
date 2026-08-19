import { Keys } from "@starlive/shared";
import { cached, invalidateCache } from "./cache";
import { redis } from "./redis";
import { config } from "../config/config";

/**
 * 运行时配置：后台面板写入的 Redis(system:config) 优先，环境变量兜底。
 * 除 REDIS_URL / JWT_SECRET / PORT / HOST 等启动必需项外，
 * 业务配置（站点地址、OAuth、支付网关）均可在后台面板设置、即时生效。
 */
const ENV_FALLBACK: Record<string, string> = {
  app_base_url: config.appBaseUrl,
  oauth_provider_name: config.oauthProviderName,
  oauth_client_id: config.oauthClientId,
  oauth_client_secret: config.oauthClientSecret,
  oauth_redirect_uri: config.oauthRedirectUri,
  oauth_auth_url: config.oauthAuthUrl,
  oauth_token_url: config.oauthTokenUrl,
  oauth_userinfo_url: config.oauthUserInfoUrl,
  stream_provider: config.streamProvider,
  mux_token_id: config.muxTokenId,
  mux_token_secret: config.muxTokenSecret,
};

async function loadAll(): Promise<Record<string, string>> {
  return cached("system_config", 10_000, () => redis().hgetall(Keys.systemConfig));
}

export async function runtimeConfig(key: string): Promise<string> {
  const all = await loadAll();
  const v = all?.[key];
  if (v !== undefined && v !== "") return v;
  return ENV_FALLBACK[key] ?? "";
}

/** 站点对外地址（生成支付回调 / HLS 播放 / OAuth 回跳地址的基准） */
export async function getAppBaseUrl(): Promise<string> {
  const v = await runtimeConfig("app_base_url");
  return v.replace(/\/+$/, "");
}

/** OAuth 登录配置（后台面板优先；redirect_uri 缺省从站点地址推导） */
export async function getOAuthConfig(): Promise<{
  providerName: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
}> {
  const [providerName, clientId, clientSecret, redirectUri, authUrl, tokenUrl, userInfoUrl, base] =
    await Promise.all([
      runtimeConfig("oauth_provider_name"),
      runtimeConfig("oauth_client_id"),
      runtimeConfig("oauth_client_secret"),
      runtimeConfig("oauth_redirect_uri"),
      runtimeConfig("oauth_auth_url"),
      runtimeConfig("oauth_token_url"),
      runtimeConfig("oauth_userinfo_url"),
      getAppBaseUrl(),
    ]);
  return {
    providerName: providerName || "OAuth",
    clientId,
    clientSecret,
    redirectUri: redirectUri || `${base}/api/auth/oauth-callback`,
    authUrl,
    tokenUrl,
    userInfoUrl,
  };
}

/** 后台保存配置后调用，立即生效 */
export function invalidateRuntimeConfig(): void {
  invalidateCache("system_config");
}
