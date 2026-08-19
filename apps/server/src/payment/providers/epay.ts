import { createHash } from "crypto";
import type { PaymentOrderStatus, PaymentProvider, PayResult, VerifiedPayment } from "@starlive/shared";
import { BizException } from "../../common/errors";
import { getAppBaseUrl } from "../../common/runtime-config";
import { config } from "../../config/config";
import { asCallback, gatewayConfig, paymentForm } from "../common";

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

export class EpayProvider implements PaymentProvider {
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
    const base = await getAppBaseUrl();
    const params: Record<string, string> = {
      pid,
      type: "alipay",
      out_trade_no: order.orderId,
      notify_url: `${base}/api/payment/callback/epay`,
      return_url: `${base}/recharge?order=${order.orderId}`,
      name: order.subject,
      money: order.amount.toFixed(2),
      sign_type: "MD5",
    };
    params.sign = epaySign(params, key);

    return { type: "form", payload: paymentForm("epay-submit", `${gateway}/submit.php`, params) };
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
