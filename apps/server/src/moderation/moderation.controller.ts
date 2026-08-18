import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../common/guards";
import { ModerationService } from "./moderation.service";

@Controller()
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Post("room-moderators-manage")
  @UseGuards(AuthGuard)
  manageModerator(
    @Req() req: AuthedRequest,
    @Body() body: { roomId: string; targetUserId: string; action: "add" | "remove" },
  ) {
    if (body.action === "add") {
      return this.moderation.addModerator(body.roomId, req.user!.sub, body.targetUserId);
    }
    return this.moderation.removeModerator(body.roomId, req.user!.sub, body.targetUserId);
  }

  @Get("room-moderators-list")
  listModerators(@Query("roomId") roomId: string) {
    return this.moderation.listModerators(roomId);
  }

  @Post("room-user-mute")
  @UseGuards(AuthGuard)
  mute(
    @Req() req: AuthedRequest,
    @Body() body: { roomId: string; userId?: string; guestId?: string; name?: string; durationSec?: number },
  ) {
    return this.moderation.mute(
      body.roomId,
      req.user!.sub,
      { userId: body.userId, guestId: body.guestId, name: body.name },
      body.durationSec,
    );
  }

  @Post("room-user-unmute")
  @UseGuards(AuthGuard)
  unmute(@Req() req: AuthedRequest, @Body() body: { roomId: string; identity: string }) {
    return this.moderation.unmute(body.roomId, req.user!.sub, body.identity);
  }

  @Get("room-muted-users")
  mutedUsers(@Query("roomId") roomId: string) {
    return this.moderation.mutedUsers(roomId);
  }

  @Get("room-moderation-log")
  moderationLog(@Query("roomId") roomId: string) {
    return this.moderation.moderationLog(roomId);
  }

  @Post("report-create")
  @UseGuards(AuthGuard)
  createReport(
    @Req() req: AuthedRequest,
    @Body() body: { roomId: string; danmakuId?: string; targetUserId?: string; reason: string },
  ) {
    return this.moderation.createReport({ reporterId: req.user!.sub, ...body });
  }
}
