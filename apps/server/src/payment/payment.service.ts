import { Injectable } from "@nestjs/common";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import {
  ErrorCode,
  type PaymentOrderStatus,
  type PaymentProvider,
  type PayResult,
  type VerifiedPayment,
} from "@starlive/shared";
import { BizException } from "../common/errors";
import { config } from "../config/config";

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

  private ensureConfigured(): { pid: string; key: string; gateway: string } {
    if (!config.epayPid || !config.epayKey || !config.epayGateway) {
      throw new BizException(5000, "易支付未配置（EPAY_PID/EPAY_KEY/EPAY_GATEWAY）");
    }
    return { pid: config.epayPid, key: config.epayKey, gateway: config.epayGateway };
  }

  async createOrder(order: {
    orderId: string;
    amount: number;
    coins: number;
    subject: string;
  }): Promise<PayResult> {
    const { pid, key, gateway } = this.ensureConfigured();
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
    const { key } = this.ensureConfigured();
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
    const { pid, key, gateway } = this.ensureConfigured();
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

/** Stripe Checkout：REST 直连（form 编码），无 SDK 依赖 */
class StripeProvider implements PaymentProvider {
  readonly name = "stripe";
  private static readonly API = "https://api.stripe.com/v1";

  private ensureConfigured(): { secretKey: string } {
    if (!config.stripeSecretKey) {
      throw new BizException(5000, "Stripe 未配置（STRIPE_SECRET_KEY）");
    }
    return { secretKey: config.stripeSecretKey };
  }

  private async api<T>(path: string, form?: Record<string, string>): Promise<T> {
    const { secretKey } = this.ensureConfigured();
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
    const session = await this.api<{ id: string; url: string }>("/checkout/sessions", {
      mode: "payment",
      client_reference_id: order.orderId,
      "metadata[orderId]": order.orderId,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": config.stripeCurrency,
      "line_items[0][price_data][unit_amount]": String(Math.round(order.amount * 100)),
      "line_items[0][price_data][product_data][name]": order.subject,
      success_url: `${config.appBaseUrl}/recharge?order=${order.orderId}`,
      cancel_url: `${config.appBaseUrl}/recharge`,
    });
    return { type: "url", payload: session.url, providerRef: session.id };
  }

  /** Webhook 验签：stripe-signature = t=时间戳,v1=HMAC-SHA256(secret, `${t}.${rawBody}`) */
  async verifyCallback(payload: unknown): Promise<VerifiedPayment> {
    if (!config.stripeWebhookSecret) {
      throw new BizException(5000, "Stripe Webhook 未配置（STRIPE_WEBHOOK_SECRET）");
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
    const expected = createHmac("sha256", config.stripeWebhookSecret)
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

  listProviders(): string[] {
    return [...this.providers.keys()];
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
