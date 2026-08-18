import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../common/guards";
import { RedpacketService } from "./redpacket.service";

@Controller("redpacket")
export class RedpacketController {
  constructor(private readonly redpacket: RedpacketService) {}

  @Post("create")
  @UseGuards(AuthGuard)
  create(
    @Req() req: AuthedRequest,
    @Body() body: { roomId: string; total: number; count: number; mode: "random" | "equal" },
  ) {
    return this.redpacket.create({
      roomId: body.roomId,
      senderId: req.user!.sub,
      total: body.total,
      count: body.count,
      mode: body.mode,
    });
  }

  @Post("claim")
  @UseGuards(AuthGuard)
  claim(@Req() req: AuthedRequest, @Body() body: { redpacketId: string }) {
    return this.redpacket.claim(body.redpacketId, req.user!.sub);
  }

  @Get("list")
  list(@Query("roomId") roomId: string) {
    return this.redpacket.list(roomId);
  }
}
