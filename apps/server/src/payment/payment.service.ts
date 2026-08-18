import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import type {
  PaymentOrderStatus,
  PaymentProvider,
  PayResult,
  VerifiedPayment,
} from "@starlive/shared";
import { BizException } from "../common/errors";
import { config } from "../config/config";

class MockProvider implements PaymentProvider {
  readonly name = "mock";

  async createOrder(order: {
    orderId: string;
    amount: number;
    coins: number;
    subject: string;
  }): Promise<PayResult> {
    return {
      type: "url",
      payload: `${config.appBaseUrl}/mock-pay?order=${order.orderId}&amount=${order.amount}&coins=${order.coins}`,
    };
  }

  async verifyCallback(payload: Record<string, unknown>): Promise<VerifiedPayment> {
    return {
      orderId: String(payload?.orderId ?? ""),
      amount: Number(payload?.amount ?? 0),
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
      return_url: `${config.appBaseUrl}/recharge`,
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

  async verifyCallback(payload: Record<string, unknown>): Promise<VerifiedPayment> {
    const { key } = this.ensureConfigured();
    const params = Object.fromEntries(
      Object.entries(payload).map(([k, v]) => [k, String(v)]),
    );
    const receivedSign = params.sign ?? "";
    const expected = epaySign(params, key);
    if (!receivedSign || receivedSign !== expected) {
      throw new BizException(5001, "易支付验签失败");
    }
    return {
      orderId: params.out_trade_no ?? "",
      amount: Number(params.money ?? 0),
      providerTradeNo: params.trade_no ?? "",
    };
  }

  async queryOrder(): Promise<PaymentOrderStatus> {
    this.ensureConfigured();
    return "pending";
  }

  async refund(): Promise<void> {
    this.ensureConfigured();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

@Injectable()
export class PaymentService {
  private readonly providers = new Map<string, PaymentProvider>();

  constructor() {
    this.register(new MockProvider());
    this.register(new EpayProvider());
  }

  register(provider: PaymentProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): PaymentProvider {
    return this.providers.get(name) ?? this.providers.get("mock")!;
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

  queryOrder(providerName: string, orderId: string) {
    return this.get(providerName).queryOrder(orderId);
  }

  refund(providerName: string, orderId: string) {
    return this.get(providerName).refund(orderId);
  }
}
