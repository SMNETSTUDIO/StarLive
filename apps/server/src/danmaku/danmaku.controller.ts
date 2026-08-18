import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { OptionalAuthGuard, type AuthedRequest } from "../common/guards";
import { DanmakuService } from "./danmaku.service";

@Controller("danmaku")
export class DanmakuController {
  constructor(private readonly danmaku: DanmakuService) {}

  @Post("send")
  @UseGuards(OptionalAuthGuard)
  send(
    @Req() req: AuthedRequest,
    @Body()
    body: {
      roomId: string;
      content: string;
      guestId?: string;
      name?: string;
      avatar?: string;
    },
  ) {
    return this.danmaku.send({
      roomId: body.roomId,
      content: body.content,
      userId: req.user?.sub,
      guestId: body.guestId,
      name: body.name ?? req.user?.name ?? "游客",
      avatar: body.avatar,
    });
  }

  @Get("list")
  list(@Query("roomId") roomId: string, @Query("since") since?: string) {
    return this.danmaku.list(roomId, since ? Number(since) : undefined);
  }

  @Get("recent")
  recent(@Query("roomId") roomId: string) {
    return this.danmaku.recent(roomId);
  }
}
