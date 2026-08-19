import { randomUUID } from "crypto";
import type { PaymentOrderStatus, PaymentProvider, PayResult, VerifiedPayment } from "@starlive/shared";
import { getAppBaseUrl } from "../../common/runtime-config";
import { asCallback } from "../common";

export class MockProvider implements PaymentProvider {
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
      payload: `${await getAppBaseUrl()}/recharge?order=${order.orderId}`,
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
