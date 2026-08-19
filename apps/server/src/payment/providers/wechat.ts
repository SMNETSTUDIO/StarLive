import { createDecipheriv, createSign, randomUUID } from "crypto";
import type { PaymentOrderStatus, PaymentProvider, PayResult, VerifiedPayment } from "@starlive/shared";
import { BizException } from "../../common/errors";
import { getAppBaseUrl } from "../../common/runtime-config";
import { config } from "../../config/config";
import { asCallback, gatewayConfig, pemWrap } from "../common";
import { ERR_CALLBACK_IGNORED } from "../common";

/** 微信支付 v3（Native 扫码支付），REST 直连零 SDK 依赖 */
export class WechatProvider implements PaymentProvider {
  readonly name = "wechat";
  private static readonly API = "https://api.mch.weixin.qq.com";

  private async loadConfig(): Promise<{
    appId: string;
    mchId: string;
    apiV3Key: string;
    serialNo: string;
    privateKey: string;
  }> {
    const c = await gatewayConfig("wechat", {
      appId: config.wechatAppId,
      mchId: config.wechatMchId,
      apiV3Key: config.wechatApiV3Key,
      serialNo: config.wechatSerialNo,
      privateKey: config.wechatPrivateKey,
    });
    if (!c.appId || !c.mchId || !c.apiV3Key || !c.serialNo || !c.privateKey) {
      throw new BizException(5000, "微信支付未配置（后台系统设置或 WECHAT_* 环境变量）");
    }
    return c as {
      appId: string;
      mchId: string;
      apiV3Key: string;
      serialNo: string;
      privateKey: string;
    };
  }

  async isConfigured(): Promise<boolean> {
    return this.loadConfig().then(() => true).catch(() => false);
  }

  /** v3 请求签名：WECHATPAY2-SHA256-RSA2048（商户 API 私钥） */
  private authHeader(
    cfg: { mchId: string; serialNo: string; privateKey: string },
    method: string,
    urlPath: string,
    body: string,
  ): string {
    const nonce = randomUUID().replace(/-/g, "");
    const ts = String(Math.floor(Date.now() / 1000));
    const message = `${method}\n${urlPath}\n${ts}\n${nonce}\n${body}\n`;
    const signature = createSign("RSA-SHA256")
      .update(message, "utf8")
      .sign(pemWrap(cfg.privateKey, "PRIVATE KEY"), "base64");
    return (
      `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.mchId}",` +
      `nonce_str="${nonce}",signature="${signature}",timestamp="${ts}",serial_no="${cfg.serialNo}"`
    );
  }

  private async api<T>(
    cfg: Awaited<ReturnType<WechatProvider["loadConfig"]>>,
    method: "GET" | "POST",
    path: string,
    bodyObj?: Record<string, unknown>,
  ): Promise<T> {
    const body = bodyObj ? JSON.stringify(bodyObj) : "";
    const res = await fetch(`${WechatProvider.API}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader(cfg, method, path, body),
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "StarLive/1.0",
      },
      body: body || undefined,
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) {
      throw new BizException(5000, `微信支付：${data?.message ?? res.statusText}`);
    }
    return data;
  }

  async createOrder(order: {
    orderId: string;
    amount: number;
    coins: number;
    subject: string;
  }): Promise<PayResult> {
    const cfg = await this.loadConfig();
    const r = await this.api<{ code_url?: string }>(cfg, "POST", "/v3/pay/transactions/native", {
      appid: cfg.appId,
      mchid: cfg.mchId,
      description: order.subject,
      out_trade_no: order.orderId,
      notify_url: `${await getAppBaseUrl()}/api/payment/callback/wechat`,
      amount: { total: Math.round(order.amount * 100), currency: "CNY" },
    });
    if (!r.code_url) throw new BizException(5000, "微信支付下单失败：未返回 code_url");
    return { type: "qrcode", payload: r.code_url };
  }

  /**
   * 回调验签 + 解密：resource 使用 APIv3 密钥 AES-256-GCM（AEAD）解密，
   * 解密成功即证明报文由密钥持有方（微信）产生，等效于完成真实性校验。
   */
  async verifyCallback(payload: unknown): Promise<VerifiedPayment> {
    const cfg = await this.loadConfig();
    const { body } = asCallback(payload);
    const eventType = String(body.event_type ?? "");
    const resource = body.resource as
      | { ciphertext?: string; nonce?: string; associated_data?: string }
      | undefined;
    if (!resource?.ciphertext || !resource.nonce) {
      throw new BizException(5001, "微信支付回调缺少加密数据");
    }
    let decrypted: string;
    try {
      const buf = Buffer.from(resource.ciphertext, "base64");
      const authTag = buf.subarray(buf.length - 16);
      const data = buf.subarray(0, buf.length - 16);
      const decipher = createDecipheriv(
        "aes-256-gcm",
        Buffer.from(cfg.apiV3Key, "utf8"),
        Buffer.from(resource.nonce, "utf8"),
      );
      decipher.setAuthTag(authTag);
      if (resource.associated_data) {
        decipher.setAAD(Buffer.from(resource.associated_data, "utf8"));
      }
      decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch {
      throw new BizException(5001, "微信支付回调解密失败（APIv3 密钥不匹配）");
    }
    if (eventType && eventType !== "TRANSACTION.SUCCESS") {
      throw new BizException(ERR_CALLBACK_IGNORED, `忽略事件：${eventType}`);
    }
    const tx = JSON.parse(decrypted) as {
      out_trade_no?: string;
      transaction_id?: string;
      trade_state?: string;
      amount?: { total?: number };
    };
    if (tx.trade_state && tx.trade_state !== "SUCCESS") {
      throw new BizException(ERR_CALLBACK_IGNORED, `微信支付交易状态：${tx.trade_state}`);
    }
    return {
      orderId: tx.out_trade_no ?? "",
      amount: (tx.amount?.total ?? 0) / 100,
      providerTradeNo: tx.transaction_id ?? "",
    };
  }

  async queryOrder(orderId: string): Promise<PaymentOrderStatus> {
    const cfg = await this.loadConfig();
    try {
      const r = await this.api<{ trade_state?: string }>(
        cfg,
        "GET",
        `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderId)}?mchid=${encodeURIComponent(cfg.mchId)}`,
      );
      return r.trade_state === "SUCCESS" ? "paid" : "pending";
    } catch {
      return "pending";
    }
  }

  async refund(orderId: string): Promise<void> {
    const cfg = await this.loadConfig();
    // 全额退款：先查单取实付金额
    const q = await this.api<{ trade_state?: string; amount?: { total?: number } }>(
      cfg,
      "GET",
      `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderId)}?mchid=${encodeURIComponent(cfg.mchId)}`,
    );
    if (q.trade_state !== "SUCCESS" || !q.amount?.total) {
      throw new BizException(5000, "微信支付退款失败：订单未支付或查询无结果");
    }
    await this.api(cfg, "POST", "/v3/refund/domestic/refunds", {
      out_trade_no: orderId,
      out_refund_no: `re_${orderId}`,
      amount: { refund: q.amount.total, total: q.amount.total, currency: "CNY" },
    });
  }
}
