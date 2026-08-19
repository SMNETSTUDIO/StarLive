import { createHmac, timingSafeEqual } from "crypto";
import type { PaymentOrderStatus, PaymentProvider, PayResult, VerifiedPayment } from "@starlive/shared";
import { BizException } from "../../common/errors";
import { getAppBaseUrl } from "../../common/runtime-config";
import { config } from "../../config/config";
import { asCallback, gatewayConfig } from "../common";
import { ERR_CALLBACK_IGNORED } from "../common";

/** Stripe Checkout：REST 直连（form 编码），无 SDK 依赖 */
export class StripeProvider implements PaymentProvider {
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
    const base = await getAppBaseUrl();
    const session = await this.api<{ id: string; url: string }>("/checkout/sessions", {
      mode: "payment",
      client_reference_id: order.orderId,
      "metadata[orderId]": order.orderId,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": currency,
      "line_items[0][price_data][unit_amount]": String(Math.round(order.amount * 100)),
      "line_items[0][price_data][product_data][name]": order.subject,
      success_url: `${base}/recharge?order=${order.orderId}`,
      cancel_url: `${base}/recharge`,
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
