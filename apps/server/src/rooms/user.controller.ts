import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { OptionalAuthGuard, type AuthedRequest } from "../common/guards";
import { RoomsService } from "./rooms.service";

/** 公开用户主页（无需登录，登录后附带我的关注状态） */
@Controller("user")
export class UserController {
  constructor(private readonly rooms: RoomsService) {}

  @Get("public")
  @UseGuards(OptionalAuthGuard)
  publicProfile(@Req() req: AuthedRequest, @Query("userId") userId: string) {
    return this.rooms.publicProfile(req.user?.sub, userId);
  }
}
