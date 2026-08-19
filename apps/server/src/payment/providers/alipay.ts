import { createSign, createVerify } from "crypto";
import type { PaymentOrderStatus, PaymentProvider, PayResult, VerifiedPayment } from "@starlive/shared";
import { BizException } from "../../common/errors";
import { getAppBaseUrl } from "../../common/runtime-config";
import { config } from "../../config/config";
import { asCallback, gatewayConfig, paymentForm, pemWrap } from "../common";
import { ERR_CALLBACK_IGNORED } from "../common";

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
export class AlipayProvider implements PaymentProvider {
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
    const base = await getAppBaseUrl();
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
        notify_url: `${base}/api/payment/callback/alipay`,
        return_url: `${base}/recharge?order=${order.orderId}`,
      },
    );

    return {
      type: "form",
      payload: paymentForm("alipay-submit", `${cfg.gateway}?charset=utf-8`, params),
    };
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
