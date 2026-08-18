import {
  All,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../common/guards";
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
  createOrder(
    @Req() req: AuthedRequest,
    @Body() body: { coins: number; provider: string },
  ) {
    return this.wallet.createOrder(req.user!.sub, body.coins, body.provider ?? "epay");
  }

  @All("payment/callback/:provider")
  paymentCallback(
    @Param("provider") provider: string,
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, string>,
  ) {
    // 易支付等网关异步通知使用 GET 查询参数，需合并 query 与 body
    return this.wallet.paymentCallback(provider, { ...query, ...body });
  }
}
