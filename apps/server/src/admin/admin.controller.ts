import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { RequireAdminGuard, SuperAdminGuard, type AuthedRequest } from "../common/guards";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(RequireAdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("stats")
  stats() {
    return this.admin.stats();
  }

  @Get("users")
  users() {
    return this.admin.listUsers();
  }

  @Post("user-flag")
  setUserFlag(
    @Req() req: AuthedRequest,
    @Body() body: { userId: string; field: "banned" | "muted"; value: boolean },
  ) {
    return this.admin.setUserFlag(body.userId, body.field, body.value, req.user!.sub);
  }

  @Post("user-update")
  userUpdate(
    @Req() req: AuthedRequest,
    @Body() body: { userId: string; name?: string; email?: string; avatarUrl?: string },
  ) {
    return this.admin.adminUserUpdate(body.userId, body, req.user!.sub);
  }

  @Post("user-password")
  userPassword(@Req() req: AuthedRequest, @Body() body: { userId: string; password: string }) {
    return this.admin.adminUserPassword(body.userId, body.password, req.user!.sub);
  }

  @Post("balance-adjust")
  balanceAdjust(
    @Req() req: AuthedRequest,
    @Body() body: { userId: string; delta: number; reason?: string },
  ) {
    return this.admin.adminBalanceAdjust(body.userId, Number(body.delta), body.reason ?? "", req.user!.sub);
  }

  @Get("rooms")
  rooms() {
    return this.admin.listRooms();
  }

  @Post("room-update")
  roomUpdate(
    @Req() req: AuthedRequest,
    @Body()
    body: { roomId: string; title?: string; isPublic?: boolean; category?: string; announcement?: string },
  ) {
    return this.admin.adminRoomUpdate(body.roomId, body, req.user!.sub);
  }

  @Post("room-delete")
  roomDelete(@Req() req: AuthedRequest, @Body() body: { roomId: string }) {
    return this.admin.adminRoomDelete(body.roomId, req.user!.sub);
  }

  @Post("room-ban")
  roomBan(@Req() req: AuthedRequest, @Body() body: { roomId: string; banned: boolean }) {
    return this.admin.adminRoomBan(body.roomId, body.banned, req.user!.sub);
  }

  @Get("withdrawals")
  withdrawals(@Query("status") status: string) {
    return this.admin.listWithdrawals(status ?? "pending");
  }

  @Post("withdrawal-process")
  withdrawalProcess(
    @Req() req: AuthedRequest,
    @Body() body: { id: string; action: "approve" | "reject" },
  ) {
    return this.admin.processWithdrawal(body.id, body.action, req.user!.sub);
  }

  @Get("orders")
  orders() {
    return this.admin.listOrders();
  }

  @Get("roles")
  @UseGuards(SuperAdminGuard)
  roles() {
    return this.admin.listRoles();
  }

  @Post("role-update")
  @UseGuards(SuperAdminGuard)
  roleUpdate(@Body() body: { roleId: string; permissions: string[] }) {
    return this.admin.updateRole(body.roleId, body.permissions);
  }

  @Get("user-roles")
  @UseGuards(SuperAdminGuard)
  userRoles() {
    return this.admin.listUserRoles();
  }

  @Post("user-role-set")
  @UseGuards(SuperAdminGuard)
  userRoleSet(@Body() body: { userId: string; roleId: string | null }) {
    return this.admin.setUserRole(body.userId, body.roleId);
  }

  @Get("audit")
  audit(@Query("limit") limit?: string) {
    return this.admin.listAudit(Number(limit ?? 100));
  }

  @Get("sensitive-words")
  sensitiveWords() {
    return this.admin.listSensitiveWords();
  }

  @Post("sensitive-word-add")
  sensitiveWordAdd(@Req() req: AuthedRequest, @Body() body: { word: string }) {
    return this.admin.addSensitiveWord(body.word, req.user!.sub);
  }

  @Post("sensitive-word-remove")
  sensitiveWordRemove(@Req() req: AuthedRequest, @Body() body: { word: string }) {
    return this.admin.removeSensitiveWord(body.word, req.user!.sub);
  }

  @Get("reports")
  reports(@Query("status") status?: string) {
    return this.admin.listReports(status);
  }

  @Post("report-process")
  reportProcess(
    @Req() req: AuthedRequest,
    @Body() body: { reportId: string; action: "resolve" | "dismiss" },
  ) {
    return this.admin.processReport(body.reportId, body.action, req.user!.sub);
  }

  @Get("features")
  features() {
    return this.admin.getFeatures();
  }

  @Post("features-update")
  featuresUpdate(@Req() req: AuthedRequest, @Body() body: Record<string, boolean | string>) {
    return this.admin.updateFeatures(body, req.user!.sub);
  }

  @Get("config")
  config() {
    return this.admin.getConfig();
  }

  @Post("config-update")
  configUpdate(@Req() req: AuthedRequest, @Body() body: Record<string, string>) {
    return this.admin.updateConfig(body, req.user!.sub);
  }

  @Post("announcement")
  announcement(@Req() req: AuthedRequest, @Body() body: { title: string; content: string }) {
    return this.admin.setAnnouncement(body, req.user!.sub);
  }

  @Get("danmaku")
  danmaku(@Query("roomId") roomId: string) {
    return this.admin.danmakuList(roomId);
  }
}
