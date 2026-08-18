import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../common/guards";
import { GiftService } from "./gift.service";

@Controller("gift")
export class GiftController {
  constructor(private readonly gift: GiftService) {}

  @Get("list")
  list() {
    return this.gift.list();
  }

  @Post("send")
  @UseGuards(AuthGuard)
  send(
    @Req() req: AuthedRequest,
    @Body() body: { roomId: string; giftId: string; count: number },
  ) {
    return this.gift.send({
      roomId: body.roomId,
      giftId: body.giftId,
      count: body.count,
      userId: req.user!.sub,
      name: req.user!.name ?? req.user!.username ?? "用户",
    });
  }

  @Get("room-rewards")
  roomRewards(@Query("roomId") roomId: string) {
    return this.gift.roomRewards(roomId);
  }

  @Get("earnings")
  @UseGuards(AuthGuard)
  earnings(@Req() req: AuthedRequest, @Query("days") days?: string) {
    return this.gift.ownerEarnings(req.user!.sub, days ? Number(days) : 14);
  }
}
