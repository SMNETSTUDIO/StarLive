import { ErrorCode, Keys } from "@starlive/shared";
import { redis } from "../common/redis";

/** 回调统一载荷：body 为已解析参数（GET query 与 POST body 合并），rawBody/headers 供签名校验类网关使用 */
export interface CallbackPayload {
  body: Record<string, unknown>;
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
}

/** Stripe 无关事件标记：控制器捕获后返回 2xx，避免网关无限重试 */
export const ERR_CALLBACK_IGNORED = ErrorCode.PAYMENT_CALLBACK_IGNORED;

export function asCallback(payload: unknown): CallbackPayload {
  const p = payload as Partial<CallbackPayload> | undefined;
  return {
    body: p?.body ?? {},
    rawBody: p?.rawBody ?? "",
    headers: p?.headers ?? {},
  };
}

/** 网关配置：后台写入的 Redis(payment:config:{provider}) 优先，环境变量兜底 */
export async function gatewayConfig(
  provider: string,
  envDefaults: Record<string, string>,
): Promise<Record<string, string>> {
  const stored = await redis().hgetall(Keys.paymentConfig(provider));
  const merged = { ...envDefaults };
  for (const [k, v] of Object.entries(stored ?? {})) {
    if (v) merged[k] = v;
  }
  return merged;
}

/** 防止通过表单参数注入隐藏标签，破坏下单页结构 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 裸 base64 密钥自动补 PEM 头尾（支付宝开放平台默认给的是无头尾格式） */
export function pemWrap(key: string, type: "PRIVATE KEY" | "RSA PRIVATE KEY" | "PUBLIC KEY"): string {
  const t = key.trim();
  if (t.includes("BEGIN")) return t;
  const body = t.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `-----BEGIN ${type}-----\n${lines}\n-----END ${type}-----`;
}

/** 生成自动提交的支付表单（易支付/支付宝通用） */
export function paymentForm(id: string, action: string, params: Record<string, string>): string {
  const inputs = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v)}" />`)
    .join("");
  return (
    `<form id="${id}" method="post" action="${escapeHtml(action)}">` +
    inputs +
    `</form><script>document.getElementById("${id}").submit();</script>`
  );
}
