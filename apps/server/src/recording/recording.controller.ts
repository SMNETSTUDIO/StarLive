import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../common/guards";
import { RecordingService } from "./recording.service";

@Controller("recording")
export class RecordingController {
  constructor(private readonly recording: RecordingService) {}

  @Get("list")
  list(@Query("roomId") roomId: string) {
    return this.recording.list(roomId);
  }

  @Get("download")
  download(@Query("recordingId") recordingId: string) {
    return this.recording.download(recordingId);
  }

  @Post("share-create")
  @UseGuards(AuthGuard)
  createShare(
    @Req() req: AuthedRequest,
    @Body() body: { recordingId: string; permanent?: boolean },
  ) {
    return this.recording.createShare(body.recordingId, req.user!.sub, body.permanent === true);
  }

  @Get("share-info")
  shareInfo(@Query("token") token: string) {
    return this.recording.shareInfo(token);
  }

  @Get("share-list")
  @UseGuards(AuthGuard)
  listShares(@Req() req: AuthedRequest, @Query("roomId") roomId: string) {
    return this.recording.listShares(roomId, req.user!.sub);
  }

  @Post("share-revoke")
  @UseGuards(AuthGuard)
  revokeShare(@Req() req: AuthedRequest, @Body() body: { token: string }) {
    return this.recording.revokeShare(body.token, req.user!.sub);
  }
}
