import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../common/guards";
import { LotteryService } from "./lottery.service";

@Controller("lottery")
export class LotteryController {
  constructor(private readonly lottery: LotteryService) {}

  @Post("create")
  @UseGuards(AuthGuard)
  create(
    @Req() req: AuthedRequest,
    @Body() body: { roomId: string; title: string; winnerCount: number; durationSec: number },
  ) {
    return this.lottery.create({
      roomId: body.roomId,
      ownerId: req.user!.sub,
      title: body.title,
      winnerCount: body.winnerCount,
      durationSec: body.durationSec,
    });
  }

  @Post("join")
  @UseGuards(AuthGuard)
  join(@Req() req: AuthedRequest, @Body() body: { lotteryId: string }) {
    return this.lottery.join(body.lotteryId, req.user!.sub);
  }

  @Post("draw")
  @UseGuards(AuthGuard)
  draw(@Req() req: AuthedRequest, @Body() body: { lotteryId: string }) {
    return this.lottery.draw(body.lotteryId, req.user!.sub);
  }

  @Get("get")
  get(@Query("roomId") roomId: string) {
    return this.lottery.get(roomId);
  }

  @Get("history")
  history(@Query("roomId") roomId: string) {
    return this.lottery.history(roomId);
  }
}
