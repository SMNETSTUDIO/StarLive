import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, OptionalAuthGuard, type AuthedRequest } from "../common/guards";
import { RoomsService } from "./rooms.service";

@Controller("room")
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post("create")
  @UseGuards(AuthGuard)
  create(
    @Req() req: AuthedRequest,
    @Body()
    body: {
      title: string;
      customRoomId?: string;
      announcement?: string;
      isPublic?: boolean;
      password?: string;
      category?: string;
      tags?: string[];
    },
  ) {
    return this.rooms.create(req.user!.sub, body);
  }

  @Get("get")
  @UseGuards(OptionalAuthGuard)
  get(
    @Req() req: AuthedRequest,
    @Query("roomId") roomId: string,
    @Query("password") password?: string,
  ) {
    return this.rooms.get(roomId, { userId: req.user?.sub }, password);
  }

  @Get("list")
  list(
    @Query("mine") mine?: string,
    @Query("category") category?: string,
    @Query("userId") userId?: string,
  ) {
    return this.rooms.list({
      userId,
      mine: mine === "true",
      publicOnly: mine !== "true",
      category,
    });
  }

  @Post("update")
  @UseGuards(AuthGuard)
  update(
    @Req() req: AuthedRequest,
    @Body() body: { roomId: string; title?: string; isPublic?: boolean },
  ) {
    return this.rooms.update(body.roomId, req.user!.sub, body);
  }

  @Post("tags-update")
  @UseGuards(AuthGuard)
  updateTags(
    @Req() req: AuthedRequest,
    @Body() body: { roomId: string; category?: string; tags?: string[] },
  ) {
    return this.rooms.updateTags(body.roomId, req.user!.sub, body);
  }

  @Post("announcement-update")
  @UseGuards(AuthGuard)
  updateAnnouncement(
    @Req() req: AuthedRequest,
    @Body() body: { roomId: string; announcement: string },
  ) {
    return this.rooms.updateAnnouncement(body.roomId, req.user!.sub, body.announcement);
  }

  @Delete("delete")
  @UseGuards(AuthGuard)
  remove(@Req() req: AuthedRequest, @Body() body: { roomId: string }) {
    return this.rooms.remove(body.roomId, req.user!.sub);
  }

  @Post(":roomId/heartbeat")
  @UseGuards(OptionalAuthGuard)
  heartbeat(
    @Req() req: AuthedRequest,
    @Param("roomId") roomId: string,
    @Body() body: { guestId?: string },
  ) {
    return this.rooms.heartbeat(roomId, {
      userId: req.user?.sub,
      guestId: body.guestId,
    });
  }

  @Post(":roomId/stream-status")
  @UseGuards(AuthGuard)
  setStatus(
    @Req() req: AuthedRequest,
    @Param("roomId") roomId: string,
    @Body() body: { status: "idle" | "connected" | "active" },
  ) {
    return this.rooms.setStatus(roomId, body.status);
  }
}
