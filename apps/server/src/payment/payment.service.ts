import { Injectable } from "@nestjs/common";
import {
  createHash,
  createHmac,
  createSign,
  createVerify,
  randomUUID,
  timingSafeEqual,
} from "crypto";
import {
  ErrorCode,
  Keys,
  type PaymentOrderStatus,
  type PaymentProvider,
  type PayResult,
  type VerifiedPayment,
} from "@starlive/shared";
import { BizException } from "../common/errors";
import { redis } from "../common/redis";
import { config } from "../config/config";

/** 网关配置：后台写入的 Redis(payment:config:{provider}) 优先，环境变量兜底 */
async function gatewayConfig(
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

/** 回调统一载荷：body 为已解析参数（GET query 与 POST body 合并），rawBody/headers 供签名校验类网关使用 */
export interface CallbackPayload {
  body: Record<string, unknown>;
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
}

/** Stripe 无关事件标记：控制器捕获后返回 2xx，避免网关无限重试 */
export const ERR_CALLBACK_IGNORED = ErrorCode.PAYMENT_CALLBACK_IGNORED;

function asCallback(payload: unknown): CallbackPayload {
  const p = payload as Partial<CallbackPayload> | undefined;
  return {
    body: p?.body ?? {},
    rawBody: p?.rawBody ?? "",
    headers: p?.headers ?? {},
  };
}

class MockProvider implements PaymentProvider {
  readonly name = "mock";

  async createOrder(order: {
    orderId: string;
    amount: number;
    coins: number;
    subject: string;
  }): Promise<PayResult> {
    // 沙箱：跳回充值页，由订单同步接口按 queryOrder()=paid 直接入账
    return {
      type: "url",
      payload: `${config.appBaseUrl}/recharge?order=${order.orderId}`,
    };
  }

  async verifyCallback(payload: unknown): Promise<VerifiedPayment> {
    const { body } = asCallback(payload);
    return {
      orderId: String(body?.orderId ?? ""),
      amount: Number(body?.amount ?? 0),
      providerTradeNo: randomUUID(),
    };
  }

  async queryOrder(): Promise<PaymentOrderStatus> {
    return "paid";
  }

  async refund(): Promise<void> {
    /* noop */
  }
}

function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

/** 易支付（彩虹易支付等）通用 MD5 签名：参数按 key 排序拼接后追加密钥 */
function epaySign(params: Record<string, string>, key: string): string {
  const entries = Object.entries(params)
    .filter(([k]) => k !== "sign" && k !== "sign_type")
    .sort(([a], [b]) => a.localeCompare(b));
  const raw = entries.map(([k, v]) => `${k}=${v}`).join("&") + key;
  return md5(raw);
}

class EpayProvider implements PaymentProvider {
  readonly name = "epay";

  private async loadConfig(): Promise<{ pid: string; key: string; gateway: string }> {
    const c = await gatewayConfig("epay", {
      pid: config.epayPid,
      key: config.epayKey,
      gateway: config.epayGateway,
    });
    if (!c.pid || !c.key || !c.gateway) {
      throw new BizException(5000, "易支付未配置（后台系统设置或 EPAY_* 环境变量）");
    }
    return { pid: c.pid, key: c.key, gateway: c.gateway.replace(/\/+$/, "") };
  }

  async isConfigured(): Promise<boolean> {
    return this.loadConfig().then(() => true).catch(() => false);
  }

  async createOrder(order: {
    orderId: string;
    amount: number;
    coins: number;
    subject: string;
  }): Promise<PayResult> {
    const { pid, key, gateway } = await this.loadConfig();
    const params: Record<string, string> = {
      pid,
      type: "alipay",
      out_trade_no: order.orderId,
      notify_url: `${config.appBaseUrl}/api/payment/callback/epay`,
      return_url: `${config.appBaseUrl}/recharge?order=${order.orderId}`,
      name: order.subject,
      money: order.amount.toFixed(2),
      sign_type: "MD5",
    };
    params.sign = epaySign(params, key);

    const inputs = Object.entries(params)
      .map(
        ([k, v]) =>
          `<input type="hidden" name="${k}" value="${escapeHtml(v)}" />`,
      )
      .join("");
    const form =
      `<form id="epay-submit" method="post" action="${escapeHtml(gateway)}/submit.php">` +
      inputs +
      `</form><script>document.getElementById("epay-submit").submit();</script>`;

    return { type: "form", payload: form };
  }

  async verifyCallback(payload: unknown): Promise<VerifiedPayment> {
    const { key } = await this.loadConfig();
    const { body } = asCallback(payload);
    const params = Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, String(v)]),
    );
    const receivedSign = params.sign ?? "";
    const expected = epaySign(params, key);
    if (!receivedSign || receivedSign !== expected) {
      throw new BizException(5001, "易支付验签失败");
    }
    if (params.trade_status && params.trade_status !== "TRADE_SUCCESS") {
      throw new BizException(5001, `易支付交易未成功：${params.trade_status}`);
    }
    return {
      orderId: params.out_trade_no ?? "",
      amount: Number(params.money ?? 0),
      providerTradeNo: params.trade_no ?? "",
    };
  }

  /** 主动查单（彩虹易支付通用接口 api.php?act=order），失败时保守返回 pending */
  async queryOrder(orderId: string): Promise<PaymentOrderStatus> {
    const { pid, key, gateway } = await this.loadConfig();
    try {
      const url =
        `${gateway}/api.php?act=order&pid=${encodeURIComponent(pid)}` +
        `&key=${encodeURIComponent(key)}&out_trade_no=${encodeURIComponent(orderId)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = (await res.json()) as { code?: number; status?: number | string };
      if (Number(data?.code) === 1 && Number(data?.status) === 1) return "paid";
      return "pending";
    } catch {
      return "pending";
    }
  }

  async refund(): Promise<void> {
    throw new BizException(5000, "易支付不支持接口退款，请在网关后台操作");
  }
}

/** 裸 base64 密钥自动补 PEM 头尾（支付宝开放平台默认给的是无头尾格式） */
function pemWrap(key: string, type: "PRIVATE KEY" | "RSA PRIVATE KEY" | "PUBLIC KEY"): string {
  const t = key.trim();
  if (t.includes("BEGIN")) return t;
  const body = t.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `-----BEGIN ${type}-----\n${lines}\n-----END ${type}-----`;
}

/** 支付宝 RSA2 签名串：剔除 sign 与空值，按 key 升序 k=v 拼接（请求签名含 sign_type） */
function alipayContent(params: Record<string, string>, excludeSignType: boolean): string {
  return Object.entries(params)
    .filter(([k, v]) => k !== "sign" && (!excludeSignType || k !== "sign_type") && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

function alipaySign(params: Record<string, string>, privateKey: string): string {
  const content = alipayContent(params, false);
  // 兼容 PKCS8（默认）与 PKCS1 两种私钥格式
  try {
    return createSign("RSA-SHA256").update(content, "utf8").sign(pemWrap(privateKey, "PRIVATE KEY"), "base64");
  } catch {
    try {
      return createSign("RSA-SHA256").update(content, "utf8").sign(pemWrap(privateKey, "RSA PRIVATE KEY"), "base64");
    } catch {
      throw new BizException(5000, "支付宝应用私钥无效（需 RSA2 私钥，PKCS8/PKCS1 均可）");
    }
  }
}

function alipayVerify(params: Record<string, string>, alipayPublicKey: string): boolean {
  const content = alipayContent(params, true);
  try {
    return createVerify("RSA-SHA256")
      .update(content, "utf8")
      .verify(pemWrap(alipayPublicKey, "PUBLIC KEY"), params.sign ?? "", "base64");
  } catch {
    return false;
  }
}

/** 支付宝时间戳：GMT+8 的 yyyy-MM-dd HH:mm:ss */
function alipayTimestamp(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().replace("T", " ").slice(0, 19);
}

/** 支付宝官方（电脑网站支付 alipay.trade.page.pay，RSA2），零 SDK 依赖 */
class AlipayProvider implements PaymentProvider {
  readonly name = "alipay";

  private async loadConfig(): Promise<{
    appId: string;
    privateKey: string;
    alipayPublicKey: string;
    gateway: string;
  }> {
    const c = await gatewayConfig("alipay", {
      appId: config.alipayAppId,
      privateKey: config.alipayPrivateKey,
      alipayPublicKey: config.alipayPublicKey,
      gateway: config.alipayGateway,
    });
    if (!c.appId || !c.privateKey || !c.alipayPublicKey) {
      throw new BizException(5000, "支付宝未配置（后台系统设置或 ALIPAY_* 环境变量）");
    }
    return {
      appId: c.appId,
      privateKey: c.privateKey,
      alipayPublicKey: c.alipayPublicKey,
      gateway: (c.gateway || "https://openapi.alipay.com/gateway.do").replace(/\/+$/, ""),
    };
  }

  async isConfigured(): Promise<boolean> {
    return this.loadConfig().then(() => true).catch(() => false);
  }

  /** 组装公共参数并签名 */
  private buildParams(
    cfg: { appId: string; privateKey: string },
    method: string,
    bizContent: Record<string, unknown>,
    extra: Record<string, string> = {},
  ): Record<string, string> {
    const params: Record<string, string> = {
      app_id: cfg.appId,
      method,
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: alipayTimestamp(),
      version: "1.0",
      biz_content: JSON.stringify(bizContent),
      ...extra,
    };
    params.sign = alipaySign(params, cfg.privateKey);
    return params;
  }

  async createOrder(order: {
    orderId: string;
    amount: number;
    coins: number;
    subject: string;
  }): Promise<PayResult> {
    const cfg = await this.loadConfig();
    const params = this.buildParams(
      cfg,
      "alipay.trade.page.pay",
      {
        out_trade_no: order.orderId,
        total_amount: order.amount.toFixed(2),
        subject: order.subject,
        product_code: "FAST_INSTANT_TRADE_PAY",
      },
      {
        notify_url: `${config.appBaseUrl}/api/payment/callback/alipay`,
        return_url: `${config.appBaseUrl}/recharge?order=${order.orderId}`,
      },
    );

    const inputs = Object.entries(params)
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v)}" />`)
      .join("");
    const form =
      `<form id="alipay-submit" method="post" action="${escapeHtml(cfg.gateway)}?charset=utf-8">` +
      inputs +
      `</form><script>document.getElementById("alipay-submit").submit();</script>`;
    return { type: "form", payload: form };
  }

  async verifyCallback(payload: unknown): Promise<VerifiedPayment> {
    const cfg = await this.loadConfig();
    const { body } = asCallback(payload);
    const params = Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, String(v)]),
    );
    if (!alipayVerify(params, cfg.alipayPublicKey)) {
      throw new BizException(5001, "支付宝验签失败");
    }
    if (params.app_id !== cfg.appId) {
      throw new BizException(5001, "支付宝 app_id 不匹配");
    }
    if (params.trade_status !== "TRADE_SUCCESS" && params.trade_status !== "TRADE_FINISHED") {
      throw new BizException(ERR_CALLBACK_IGNORED, `支付宝交易状态：${params.trade_status ?? "未知"}`);
    }
    return {
      orderId: params.out_trade_no ?? "",
      amount: Number(params.total_amount ?? 0),
      providerTradeNo: params.trade_no ?? "",
    };
  }

  /** 网关 API 调用（查单/退款），HTTPS 直连支付宝，响应视为可信 */
  private async api<T>(cfg: Awaited<ReturnType<AlipayProvider["loadConfig"]>>, method: string, bizContent: Record<string, unknown>): Promise<T> {
    const params = this.buildParams(cfg, method, bizContent);
    const res = await fetch(cfg.gateway, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json()) as Record<string, T>;
    const key = `${method.replace(/\./g, "_")}_response`;
    return data[key];
  }

  async queryOrder(orderId: string): Promise<PaymentOrderStatus> {
    const cfg = await this.loadConfig();
    try {
      const r = await this.api<{ code?: string; trade_status?: string }>(cfg, "alipay.trade.query", {
        out_trade_no: orderId,
      });
      if (r?.code === "10000" && (r.trade_status === "TRADE_SUCCESS" || r.trade_status === "TRADE_FINISHED")) {
        return "paid";
      }
      return "pending";
    } catch {
      return "pending";
    }
  }

  async refund(orderId: string): Promise<void> {
    const cfg = await this.loadConfig();
    // 全额退款：先查单取实付金额
    const q = await this.api<{ code?: string; total_amount?: string }>(cfg, "alipay.trade.query", {
      out_trade_no: orderId,
    });
    if (q?.code !== "10000" || !q.total_amount) {
      throw new BizException(5000, "支付宝退款失败：订单查询无结果");
    }
    const r = await this.api<{ code?: string; sub_msg?: string }>(cfg, "alipay.trade.refund", {
      out_trade_no: orderId,
      refund_amount: q.total_amount,
    });
    if (r?.code !== "10000") {
      throw new BizException(5000, `支付宝退款失败：${r?.sub_msg ?? "未知错误"}`);
    }
  }
}

/** Stripe Checkout：REST 直连（form 编码），无 SDK 依赖 */
class StripeProvider implements PaymentProvider {
  readonly name = "stripe";
  private static readonly API = "https://api.stripe.com/v1";

  private async loadConfig(): Promise<{
    secretKey: string;
    webhookSecret: string;
    currency: string;
  }> {
    const c = await gatewayConfig("stripe", {
      secretKey: config.stripeSecretKey,
      webhookSecret: config.stripeWebhookSecret,
      currency: config.stripeCurrency,
    });
    if (!c.secretKey) {
      throw new BizException(5000, "Stripe 未配置（后台系统设置或 STRIPE_SECRET_KEY）");
    }
    return {
      secretKey: c.secretKey,
      webhookSecret: c.webhookSecret ?? "",
      currency: (c.currency || "usd").toLowerCase(),
    };
  }

  async isConfigured(): Promise<boolean> {
    return this.loadConfig().then(() => true).catch(() => false);
  }

  private async api<T>(path: string, form?: Record<string, string>): Promise<T> {
    const { secretKey } = await this.loadConfig();
    const res = await fetch(`${StripeProvider.API}${path}`, {
      method: form ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: form ? new URLSearchParams(form).toString() : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json()) as T & { error?: { message?: string } };
    if (!res.ok) {
      throw new BizException(5000, `Stripe：${data?.error?.message ?? res.statusText}`);
    }
    return data;
  }

  async createOrder(order: {
    orderId: string;
    amount: number;
    coins: number;
    subject: string;
  }): Promise<PayResult> {
    const { currency } = await this.loadConfig();
    const session = await this.api<{ id: string; url: string }>("/checkout/sessions", {
      mode: "payment",
      client_reference_id: order.orderId,
      "metadata[orderId]": order.orderId,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": currency,
      "line_items[0][price_data][unit_amount]": String(Math.round(order.amount * 100)),
      "line_items[0][price_data][product_data][name]": order.subject,
      success_url: `${config.appBaseUrl}/recharge?order=${order.orderId}`,
      cancel_url: `${config.appBaseUrl}/recharge`,
    });
    return { type: "url", payload: session.url, providerRef: session.id };
  }

  /** Webhook 验签：stripe-signature = t=时间戳,v1=HMAC-SHA256(secret, `${t}.${rawBody}`) */
  async verifyCallback(payload: unknown): Promise<VerifiedPayment> {
    const { webhookSecret } = await this.loadConfig();
    if (!webhookSecret) {
      throw new BizException(5000, "Stripe Webhook 未配置（后台系统设置或 STRIPE_WEBHOOK_SECRET）");
    }
    const { rawBody, headers } = asCallback(payload);
    const sigHeader = String(headers["stripe-signature"] ?? "");
    const parts = Object.fromEntries(
      sigHeader.split(",").map((kv) => kv.split("=", 2) as [string, string]),
    );
    const t = parts.t ?? "";
    const v1 = parts.v1 ?? "";
    if (!t || !v1 || !rawBody) throw new BizException(5001, "Stripe 签名缺失");
    if (Math.abs(Date.now() / 1000 - Number(t)) > 300) {
      throw new BizException(5001, "Stripe 签名已过期");
    }
    const expected = createHmac("sha256", webhookSecret)
      .update(`${t}.${rawBody}`)
      .digest("hex");
    const a = Buffer.from(v1);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BizException(5001, "Stripe 验签失败");
    }

    const event = JSON.parse(rawBody) as {
      type: string;
      data: {
        object: {
          id: string;
          payment_intent?: string;
          payment_status?: string;
          amount_total?: number;
          client_reference_id?: string;
          metadata?: { orderId?: string };
        };
      };
    };
    if (event.type !== "checkout.session.completed") {
      throw new BizException(ERR_CALLBACK_IGNORED, `忽略事件：${event.type}`);
    }
    const session = event.data.object;
    if (session.payment_status && session.payment_status !== "paid") {
      throw new BizException(ERR_CALLBACK_IGNORED, `支付未完成：${session.payment_status}`);
    }
    return {
      orderId: session.metadata?.orderId ?? session.client_reference_id ?? "",
      amount: (session.amount_total ?? 0) / 100,
      providerTradeNo: session.payment_intent ?? session.id,
    };
  }

  async queryOrder(_orderId: string, providerRef?: string): Promise<PaymentOrderStatus> {
    if (!providerRef) return "pending";
    try {
      const session = await this.api<{ payment_status?: string }>(
        `/checkout/sessions/${encodeURIComponent(providerRef)}`,
      );
      return session.payment_status === "paid" ? "paid" : "pending";
    } catch {
      return "pending";
    }
  }

  /** providerRef 传入账时记录的 payment_intent（订单 tradeNo） */
  async refund(_orderId: string, providerRef?: string): Promise<void> {
    if (!providerRef) throw new BizException(5000, "缺少 Stripe payment_intent，无法退款");
    await this.api("/refunds", { payment_intent: providerRef });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

@Injectable()
export class PaymentService {
  private readonly providers = new Map<string, PaymentProvider>();

  constructor() {
    // mock 网关可无条件入账，生产环境默认不注册（PAYMENT_MOCK_ENABLED=true 可强制开启）
    if (config.paymentMockEnabled) {
      this.register(new MockProvider());
    }
    this.register(new EpayProvider());
    this.register(new AlipayProvider());
    this.register(new StripeProvider());
  }

  register(provider: PaymentProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): PaymentProvider {
    // 未知网关必须报错，绝不能回退到 mock（否则伪造回调可免费入账）
    const p = this.providers.get(name);
    if (!p) throw new BizException(5000, `未知支付网关：${name}`);
    return p;
  }

  /** 仅返回已配置可用的网关（未配置的不出现在充值页下拉） */
  async listProviders(): Promise<string[]> {
    const out: string[] = [];
    for (const p of this.providers.values()) {
      const ok = p.isConfigured ? await p.isConfigured() : true;
      if (ok) out.push(p.name);
    }
    return out;
  }

  createOrder(
    providerName: string,
    order: { orderId: string; amount: number; coins: number; subject: string },
  ) {
    return this.get(providerName).createOrder(order);
  }

  verifyCallback(providerName: string, payload: unknown) {
    return this.get(providerName).verifyCallback(payload);
  }

  queryOrder(providerName: string, orderId: string, providerRef?: string) {
    return this.get(providerName).queryOrder(orderId, providerRef);
  }

  refund(providerName: string, orderId: string, providerRef?: string) {
    return this.get(providerName).refund(orderId, providerRef);
  }
}
