import { Injectable } from "@nestjs/common";
import { ErrorCode, Keys, type WithdrawalStatus } from "@starlive/shared";
import { genId } from "../common/audit";
import { acquireLock } from "../common/lock";
import { redis, redisPipeline } from "../common/redis";
import { BizException } from "../common/errors";
import {
  addTransaction,
  applyBalanceDelta,
  getBalance,
} from "../common/wallet-store";
import { PaymentService } from "../payment/payment.service";
import { SystemService } from "../system/system.service";

@Injectable()
export class WalletService {
  constructor(
    private readonly payment: PaymentService,
    private readonly system: SystemService,
  ) {}

  async balance(userId: string) {
    const b = await getBalance(userId);
    return { coins: b.coins, totalRecharged: b.totalRecharged, totalWithdrawn: b.totalWithdrawn };
  }

  async transactions(userId: string, limit = 50) {
    const { listTransactions } = await import("../common/wallet-store");
    return listTransactions(userId, Math.min(Math.max(limit, 1), 100));
  }

  async getDistribute(userId: string) {
    const raw = await redis().hgetall(Keys.userDistribute(userId));
    return raw ?? {};
  }

  async setDistribute(userId: string, input: { payeeId: string; payeeName: string }) {
    if (!input.payeeId) throw new BizException(ErrorCode.INVALID_AMOUNT, "收款人不能为空");
    await redis().hset(Keys.userDistribute(userId), {
      payeeId: input.payeeId,
      payeeName: input.payeeName ?? "",
    });
    return { ok: true };
  }

  async createOrder(userId: string, coins: number, provider: string) {
    if (!Number.isFinite(coins) || coins <= 0) {
      throw new BizException(ErrorCode.INVALID_AMOUNT, "充值金额无效");
    }
    const cfg = await this.system.getConfig();
    const ratio = Number(cfg.gift_coin_ratio ?? 1) || 1;
    const amount = Math.round((coins / ratio) * 100) / 100;

    const orderId = genId("ord_");
    const now = Date.now();
    const order = {
      id: orderId,
      userId,
      amount: String(amount),
      coins: String(coins),
      provider,
      status: "pending",
      createdAt: String(now),
    };
    await redisPipeline((p) => {
      p.hset(Keys.paymentOrder(orderId), order);
      p.zadd(Keys.userOrders(userId), now, orderId);
      p.zadd(Keys.paymentOrdersByStatus("pending"), now, orderId);
    });

    const payResult = await this.payment.createOrder(provider, {
      orderId,
      amount,
      coins,
      subject: `StarLive 充值 ${coins} 星币`,
    });
    return { orderId, amount, coins, payResult };
  }

  async paymentCallback(provider: string, payload: unknown) {
    const verified = await this.payment.verifyCallback(provider, payload);
    const orderId = verified.orderId;
    if (!orderId) throw new BizException(ErrorCode.PAYMENT_VERIFY_FAILED, "订单号缺失");

    const release = await acquireLock(`payment:${orderId}`, 15000);
    if (!release) throw new BizException(ErrorCode.INTERNAL, "系统繁忙");

    try {
      const order = await redis().hgetall(Keys.paymentOrder(orderId));
      if (!order || !order.id) throw new BizException(ErrorCode.NOT_FOUND, "订单不存在");
      if (order.status === "paid") {
        return { code: ErrorCode.ORDER_ALREADY_PAID, message: "already paid" };
      }
      if (Number(order.amount) !== verified.amount) {
        throw new BizException(ErrorCode.PAYMENT_VERIFY_FAILED, "金额不一致");
      }

      const coins = Number(order.coins);
      await applyBalanceDelta(order.userId, { coins, totalRecharged: coins });
      const b = await getBalance(order.userId);
      await addTransaction(order.userId, "recharge", coins, b.coins, orderId);

      await redisPipeline((p) => {
        p.hset(Keys.paymentOrder(orderId), { status: "paid", paidAt: String(Date.now()), tradeNo: verified.providerTradeNo });
        p.zrem(Keys.paymentOrdersByStatus("pending"), orderId);
        p.zadd(Keys.paymentOrdersByStatus("paid"), Date.now(), orderId);
      });
      return { ok: true };
    } finally {
      await release();
    }
  }

  /** 管理员手动补单：跳过网关验签，直接将 pending 订单入账（回调丢失时使用） */
  async adminCompleteOrder(orderId: string) {
    const release = await acquireLock(`payment:${orderId}`, 15000);
    if (!release) throw new BizException(ErrorCode.INTERNAL, "系统繁忙");
    try {
      const order = await redis().hgetall(Keys.paymentOrder(orderId));
      if (!order || !order.id) throw new BizException(ErrorCode.NOT_FOUND, "订单不存在", 404);
      if (order.status === "paid") {
        throw new BizException(ErrorCode.ORDER_ALREADY_PAID, "订单已是已支付状态");
      }

      const coins = Number(order.coins);
      await applyBalanceDelta(order.userId, { coins, totalRecharged: coins });
      const b = await getBalance(order.userId);
      await addTransaction(order.userId, "recharge", coins, b.coins, orderId);

      await redisPipeline((p) => {
        p.hset(Keys.paymentOrder(orderId), {
          status: "paid",
          paidAt: String(Date.now()),
          tradeNo: "admin_manual",
        });
        p.zrem(Keys.paymentOrdersByStatus("pending"), orderId);
        p.zadd(Keys.paymentOrdersByStatus("paid"), Date.now(), orderId);
      });
      return { ok: true, coins };
    } finally {
      await release();
    }
  }

  async requestWithdrawal(userId: string, amount: number) {
    const cfg = await this.system.getConfig();
    const min = Number(cfg.min_withdrawal ?? 10);
    const feeRate = Number(cfg.withdrawal_fee ?? 20);
    if (!Number.isFinite(amount) || amount < min) {
      throw new BizException(ErrorCode.WITHDRAW_BELOW_MIN, `最低提现 ${min} 星币`);
    }
    const b = await getBalance(userId);
    if (b.coins < amount) {
      throw new BizException(ErrorCode.INSUFFICIENT_BALANCE, "余额不足");
    }
    const fee = Math.round(amount * feeRate) / 100;
    const id = genId("wd_");
    const now = Date.now();
    await applyBalanceDelta(userId, { coins: -amount, frozenCoins: amount });
    await redisPipeline((p) => {
      p.hset(Keys.withdrawalRequest(id), {
        id,
        userId,
        amount: String(amount),
        fee: String(fee),
        net: String(amount - fee),
        status: "pending",
        createdAt: String(now),
      });
      p.zadd(Keys.withdrawalsByStatus("pending"), now, id);
      p.zadd(Keys.userWithdrawals(userId), now, id);
    });
    return { id };
  }

  async adminProcessWithdrawal(
    id: string,
    action: "approve" | "reject",
    adminId: string,
  ) {
    const release = await acquireLock(`withdrawal:${id}`, 15000);
    if (!release) throw new BizException(ErrorCode.INTERNAL, "系统繁忙");
    try {
      const wd = await redis().hgetall(Keys.withdrawalRequest(id));
      if (!wd || !wd.id) throw new BizException(ErrorCode.NOT_FOUND, "提现申请不存在");
      if (wd.status !== "pending") throw new BizException(ErrorCode.INVALID_AMOUNT, "该申请已处理");

      const amount = Number(wd.amount);
      const net = Number(wd.net ?? amount);
      let status: WithdrawalStatus;

      if (action === "approve") {
        await this.callDistributeApi(wd.userId, net);
        await applyBalanceDelta(wd.userId, { frozenCoins: -amount, totalWithdrawn: net });
        await addTransaction(wd.userId, "withdrawal", net, (await getBalance(wd.userId)).coins, id);
        status = "completed";
      } else {
        await applyBalanceDelta(wd.userId, { frozenCoins: -amount, coins: amount });
        status = "rejected";
      }

      await redisPipeline((p) => {
        p.hset(Keys.withdrawalRequest(id), { status, processedAt: String(Date.now()), processedBy: adminId });
        p.zrem(Keys.withdrawalsByStatus("pending"), id);
        p.zadd(Keys.withdrawalsByStatus(status), Date.now(), id);
      });
      return { ok: true, status };
    } finally {
      await release();
    }
  }

  async listWithdrawalsByStatus(status: string) {
    const ids = await redis().zrevrange(Keys.withdrawalsByStatus(status), 0, 99);
    if (ids.length === 0) return [];
    const rows = await redisPipeline<Record<string, string>>((p) => {
      for (const id of ids) p.hgetall(Keys.withdrawalRequest(id));
    });
    return rows.filter((r) => r && r.id);
  }

  private async callDistributeApi(userId: string, amount: number): Promise<void> {
    // LPay 提现分发（P3 接入真实接口）
    void userId;
    void amount;
  }
}
