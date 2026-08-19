import {
  All,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  type RawBodyRequest,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthGuard, type AuthedRequest } from "../common/guards";
import { assertRateLimit } from "../common/rate-limit";
import { ERR_CALLBACK_IGNORED } from "../payment/payment.service";
import { WalletService } from "./wallet.service";

@Controller()
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get("balance")
  @UseGuards(AuthGuard)
  balance(@Req() req: AuthedRequest) {
    return this.wallet.balance(req.user!.sub);
  }

  @Get("balance/transactions")
  @UseGuards(AuthGuard)
  transactions(@Req() req: AuthedRequest, @Query("limit") limit?: string) {
    return this.wallet.transactions(req.user!.sub, Number(limit ?? 50));
  }

  @Get("withdrawal/distribute")
  @UseGuards(AuthGuard)
  getDistribute(@Req() req: AuthedRequest) {
    return this.wallet.getDistribute(req.user!.sub);
  }

  @Post("withdrawal/distribute")
  @UseGuards(AuthGuard)
  setDistribute(
    @Req() req: AuthedRequest,
    @Body() body: { payeeId: string; payeeName: string },
  ) {
    return this.wallet.setDistribute(req.user!.sub, body);
  }

  @Post("withdrawal/request")
  @UseGuards(AuthGuard)
  requestWithdrawal(@Req() req: AuthedRequest, @Body() body: { amount: number }) {
    return this.wallet.requestWithdrawal(req.user!.sub, body.amount);
  }

  @Post("payment/create-order")
  @UseGuards(AuthGuard)
  async createOrder(
    @Req() req: AuthedRequest,
    @Body() body: { coins: number; provider: string },
  ) {
    await assertRateLimit(`create-order:${req.user!.sub}`, 10, 60, "下单太频繁，请稍后再试");
    return this.wallet.createOrder(req.user!.sub, body.coins, body.provider ?? "epay");
  }

  @Post("payment/order-sync")
  @UseGuards(AuthGuard)
  syncOrder(@Req() req: AuthedRequest, @Body() body: { orderId: string }) {
    return this.wallet.syncOrder(req.user!.sub, body.orderId);
  }

  @All("payment/callback/:provider")
  async paymentCallback(
    @Param("provider") provider: string,
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, string>,
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    try {
      // 易支付等网关异步通知使用 GET 查询参数，需合并 query 与 body；
      // rawBody/headers 供 Stripe 等签名校验类网关使用
      const result = await this.wallet.paymentCallback(provider, {
        body: { ...query, ...body },
        rawBody: req.rawBody?.toString("utf8") ?? "",
        headers: req.headers,
      });
      // 易支付/支付宝要求纯文本 success 应答，否则会持续重试通知
      if (provider === "epay" || provider === "alipay") return res.send("success");
      return res.json({ code: 0, message: "ok", data: result });
    } catch (e) {
      // 网关发来的无关事件（如 Stripe 非支付事件、支付宝 TRADE_CLOSED）：
      // 按各网关约定应答“已收到”，避免无限重试
      if ((e as { code?: number })?.code === ERR_CALLBACK_IGNORED) {
        if (provider === "epay" || provider === "alipay") return res.send("success");
        return res.json({ received: true });
      }
      throw e;
    }
  }
}
