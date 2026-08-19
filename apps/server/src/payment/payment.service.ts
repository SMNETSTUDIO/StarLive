import { Injectable } from "@nestjs/common";
import { Keys } from "@starlive/shared";
import type { PaymentProvider } from "@starlive/shared";
import { BizException } from "../common/errors";
import { redis } from "../common/redis";
import { config } from "../config/config";
import { AlipayProvider } from "./providers/alipay";
import { EpayProvider } from "./providers/epay";
import { MockProvider } from "./providers/mock";
import { StripeProvider } from "./providers/stripe";
import { WechatProvider } from "./providers/wechat";

export { ERR_CALLBACK_IGNORED } from "./common";
export type { CallbackPayload } from "./common";

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
    this.register(new WechatProvider());
    this.register(new StripeProvider());
  }

  register(provider: PaymentProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): PaymentProvider {
    // 未知网关必须报错，绝不能回退到 mock（否则伪造回调可免费入账）
    const provider = this.providers.get(name);
    if (!provider) throw new BizException(5000, `未知支付网关：${name}`);
    return provider;
  }

  /** 网关启用状态（enabled 字段，缺省启用）；只影响列表与新订单，不影响已有订单的回调/查单 */
  private async gatewayEnabled(name: string): Promise<boolean> {
    const value = await redis().hget(Keys.paymentConfig(name), "enabled");
    return value !== "false";
  }

  /** 仅返回已配置且启用的网关（可同时启用任意多个） */
  async listProviders(): Promise<string[]> {
    const out: string[] = [];
    for (const provider of this.providers.values()) {
      const configured = provider.isConfigured
        ? await provider.isConfigured()
        : true;
      if (configured && (await this.gatewayEnabled(provider.name))) {
        out.push(provider.name);
      }
    }
    return out;
  }

  /** 后台总览：各网关的配置/启用状态 */
  async gatewayStatus(): Promise<{ provider: string; configured: boolean; enabled: boolean }[]> {
    const out: { provider: string; configured: boolean; enabled: boolean }[] = [];
    for (const provider of this.providers.values()) {
      out.push({
        provider: provider.name,
        configured: provider.isConfigured ? await provider.isConfigured() : true,
        enabled: await this.gatewayEnabled(provider.name),
      });
    }
    return out;
  }

  async createOrder(
    providerName: string,
    order: { orderId: string; amount: number; coins: number; subject: string },
  ) {
    if (!(await this.gatewayEnabled(providerName))) {
      throw new BizException(5000, "该支付方式已停用");
    }
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
