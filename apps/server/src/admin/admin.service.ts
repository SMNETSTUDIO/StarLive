import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { ErrorCode, Keys } from "@starlive/shared";
import { invalidateAdminContext } from "../common/admin";
import { writeAdminAuditLog } from "../common/audit";
import { invalidateCache } from "../common/cache";
import { BizException } from "../common/errors";
import { DEFAULT_ADMIN_PERMISSIONS } from "../common/permissions";
import { redis, redisPipeline } from "../common/redis";
import { getRoom } from "../common/room-store";
import { getUserById, setUserField } from "../common/user-store";
import { addTransaction, applyBalanceDelta, getBalance } from "../common/wallet-store";
import { ModerationService } from "../moderation/moderation.service";
import { PaymentService } from "../payment/payment.service";
import { SystemService } from "../system/system.service";
import { WalletService } from "../wallet/wallet.service";

@Injectable()
export class AdminService {
  constructor(
    private readonly wallet: WalletService,
    private readonly moderation: ModerationService,
    private readonly system: SystemService,
    private readonly payment: PaymentService,
  ) {}

  async stats() {
    const r = redis();
    const [users, rooms, publicRooms, pendingWithdrawals] = await redisPipeline<number>((p) => {
      p.scard(Keys.usersSet);
      p.scard(Keys.roomsSet);
      p.scard(Keys.publicRoomsSet);
      p.zcard(Keys.withdrawalsByStatus("pending"));
    });
    void r;
    return { users, rooms, publicRooms, pendingWithdrawals };
  }

  /** 近 N 天趋势：每日新增用户 / 新增房间 / 充值金额 */
  async trends(days = 14) {
    const [users, rooms, orders] = await Promise.all([
      this.listUsers(),
      this.listRooms(),
      this.listOrders(),
    ]);
    const buckets: { date: string; key: string; users: number; rooms: number; revenue: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      buckets.push({
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        key: d.toDateString(),
        users: 0,
        rooms: 0,
        revenue: 0,
      });
    }
    const idx = new Map(buckets.map((b) => [b.key, b]));
    for (const u of users) {
      const b = idx.get(new Date(u.createdAt).toDateString());
      if (b) b.users++;
    }
    for (const r of rooms) {
      const b = idx.get(new Date(r.createdAt).toDateString());
      if (b) b.rooms++;
    }
    for (const o of orders) {
      if (o.status !== "paid") continue;
      const b = idx.get(new Date(o.createdAt).toDateString());
      if (b) b.revenue += o.amount;
    }
    return buckets.map(({ key: _key, ...rest }) => rest);
  }

  async listUsers() {
    const ids = await redis().smembers(Keys.usersSet);
    const rows = await redisPipeline<Record<string, string>>((p) => {
      for (const id of ids) p.hgetall(Keys.user(id));
    });
    const coins = await redisPipeline<string | null>((p) => {
      for (const id of ids) p.hget(Keys.userBalance(id), "coins");
    });
    return rows
      .map((u, i) => ({ u, coins: Number(coins[i] ?? 0) }))
      .filter(({ u }) => u && u.id)
      .map(({ u, coins: c }) => ({
        id: u.id,
        name: u.name ?? u.username,
        username: u.username,
        email: u.email,
        avatarUrl: u.avatarUrl,
        banned: u.banned === "true",
        muted: u.muted === "true",
        coins: c,
        createdAt: Number(u.createdAt ?? 0),
      }));
  }

  async setUserFlag(userId: string, field: "banned" | "muted", value: boolean, adminId: string) {
    // 校验存在，避免对不存在的 id 盲写出脏 hash（批量操作尤其容易带入无效 id）
    const user = await getUserById(userId);
    if (!user) throw new BizException(ErrorCode.NOT_FOUND, "用户不存在", 404);
    await setUserField(userId, field, value ? "true" : "false");
    await writeAdminAuditLog(`user_${field}_${value}`, adminId, { userId });
    return { ok: true };
  }

  /** 编辑用户资料（昵称 / 邮箱 / 头像） */
  async adminUserUpdate(
    userId: string,
    input: { name?: string; email?: string; avatarUrl?: string },
    adminId: string,
  ) {
    const user = await getUserById(userId);
    if (!user) throw new BizException(ErrorCode.NOT_FOUND, "用户不存在", 404);
    const r = redis();
    if (input.name !== undefined && input.name.trim()) {
      await setUserField(userId, "name", input.name.trim());
    }
    if (input.email !== undefined) {
      const email = input.email.trim();
      if (email !== (user.email ?? "")) {
        if (email) {
          const existing = await r.get(Keys.userByEmail(email));
          if (existing && existing !== userId) {
            throw new BizException(ErrorCode.INVALID_AMOUNT, "邮箱已被其他用户占用");
          }
          await r.set(Keys.userByEmail(email), userId);
        }
        if (user.email) await r.del(Keys.userByEmail(user.email));
        await setUserField(userId, "email", email);
      }
    }
    if (input.avatarUrl !== undefined) {
      await setUserField(userId, "avatarUrl", input.avatarUrl.trim());
    }
    await writeAdminAuditLog("admin_user_update", adminId, { userId });
    return { ok: true };
  }

  /** 管理员重置用户密码 */
  async adminUserPassword(userId: string, password: string, adminId: string) {
    if (!password || password.length < 6) {
      throw new BizException(ErrorCode.INVALID_AMOUNT, "密码至少 6 位");
    }
    const user = await getUserById(userId);
    if (!user) throw new BizException(ErrorCode.NOT_FOUND, "用户不存在", 404);
    const hash = await bcrypt.hash(password, 10);
    await setUserField(userId, "passwordHash", hash);
    await writeAdminAuditLog("admin_user_password_reset", adminId, { userId });
    return { ok: true };
  }

  /** 查看用户交易流水 */
  async userTransactions(userId: string, limit = 20) {
    const user = await getUserById(userId);
    if (!user) throw new BizException(ErrorCode.NOT_FOUND, "用户不存在", 404);
    return this.wallet.transactions(userId, limit);
  }

  /** 管理员调整用户星币余额（正数增加 / 负数扣减） */
  async adminBalanceAdjust(userId: string, delta: number, reason: string, adminId: string) {
    if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0) {
      throw new BizException(ErrorCode.INVALID_AMOUNT, "调整数额需为非零整数");
    }
    const user = await getUserById(userId);
    if (!user) throw new BizException(ErrorCode.NOT_FOUND, "用户不存在", 404);
    const before = await getBalance(userId);
    const after = before.coins + delta;
    if (after < 0) {
      throw new BizException(ErrorCode.INVALID_AMOUNT, `余额不足（当前 ${before.coins} SC）`);
    }
    await applyBalanceDelta(userId, { coins: delta });
    await addTransaction(userId, "admin_adjust", delta, after, reason || "管理员调整");
    await writeAdminAuditLog("admin_balance_adjust", adminId, { userId, delta, reason });
    return { coins: after };
  }

  async listRooms() {
    const ids = await redis().smembers(Keys.roomsSet);
    const rows = await redisPipeline<string[]>((p) => {
      for (const id of ids) p.hmget(Keys.room(id), "id", "title", "ownerId", "isPublic", "category", "status", "banned", "createdAt", "announcement");
    });
    return rows
      .filter((r) => r[0])
      .map((r) => ({
        id: r[0],
        title: r[1],
        ownerId: r[2],
        isPublic: r[3] === "true",
        category: r[4],
        status: r[5],
        banned: r[6] === "true",
        createdAt: Number(r[7] ?? 0),
        announcement: r[8] ?? "",
      }));
  }

  async adminRoomUpdate(
    roomId: string,
    input: { title?: string; isPublic?: boolean; category?: string; announcement?: string },
    adminId: string,
  ) {
    const room = await getRoom(roomId);
    if (!room) throw new BizException(ErrorCode.NOT_FOUND, "房间不存在", 404);
    const r = redis();
    if (input.title !== undefined && input.title.trim()) {
      await r.hset(Keys.room(roomId), "title", input.title.trim());
    }
    if (input.isPublic !== undefined) {
      await r.hset(Keys.room(roomId), "isPublic", input.isPublic ? "true" : "false");
      if (input.isPublic) await r.sadd(Keys.publicRoomsSet, roomId);
      else await r.srem(Keys.publicRoomsSet, roomId);
    }
    if (input.category !== undefined) {
      const category = input.category.trim();
      if (category !== (room.category ?? "")) {
        if (room.category) await r.srem(Keys.categoryRooms(room.category), roomId);
        if (category) await r.sadd(Keys.categoryRooms(category), roomId);
        await r.hset(Keys.room(roomId), "category", category);
      }
    }
    if (input.announcement !== undefined) {
      await r.hset(Keys.room(roomId), "announcement", input.announcement);
    }
    await writeAdminAuditLog("admin_room_update", adminId, { roomId });
    return { ok: true };
  }

  async adminRoomDelete(roomId: string, adminId: string) {
    const room = await getRoom(roomId);
    if (!room) throw new Error("room_not_found");
    const r = redis();
    await redisPipeline((p) => {
      p.del(Keys.room(roomId));
      p.srem(Keys.roomsSet, roomId);
      p.srem(Keys.publicRoomsSet, roomId);
      p.srem(Keys.userRooms(room.ownerId), roomId);
      if (room.category) p.srem(Keys.categoryRooms(room.category), roomId);
    });
    await writeAdminAuditLog("admin_room_delete", adminId, { roomId });
    return { ok: true };
  }

  async adminRoomBan(roomId: string, banned: boolean, adminId: string) {
    await redis().hset(Keys.room(roomId), "banned", banned ? "true" : "false");
    await writeAdminAuditLog(`admin_room_ban_${banned}`, adminId, { roomId });
    return { ok: true };
  }

  /** 全站录播列表（跨房间汇总，按时间倒序，最多 200 条） */
  async listRecordings() {
    const r = redis();
    const roomIds = await r.smembers(Keys.roomsSet);
    if (roomIds.length === 0) return [];

    // 两阶段批量：所有房间的录播索引+标题一次往返，全部录播详情再一次往返
    // （原实现逐房间串行 zrange+hget，N 个房间 2N+ 次往返）
    // 每房间只取最新 200 条（score=时间戳）：全局 top200 任一房间贡献不超过 200，
    // 避免录播多的房间把全量索引拉回来再在内存里裁剪
    const phase1 = await redisPipeline<string[] | string | null>((p) => {
      for (const roomId of roomIds) {
        p.zrevrange(`room:recordings:${roomId}`, 0, 199);
        p.hget(Keys.room(roomId), "title");
      }
    });

    const refs: { recId: string; roomId: string; roomTitle: string }[] = [];
    roomIds.forEach((roomId, i) => {
      const recIds = (phase1[i * 2] as string[]) ?? [];
      const title = (phase1[i * 2 + 1] as string | null) ?? roomId;
      for (const recId of recIds) refs.push({ recId, roomId, roomTitle: title });
    });
    if (refs.length === 0) return [];

    const rows = await redisPipeline<Record<string, string>>((p) => {
      for (const ref of refs) p.hgetall(Keys.recording(ref.recId));
    });

    return rows
      .map((rec, i) => ({ rec, ref: refs[i] }))
      .filter(({ rec }) => rec && rec.id)
      .map(({ rec, ref }) => ({
        id: rec.id,
        roomId: ref.roomId,
        roomTitle: ref.roomTitle,
        duration: Number(rec.duration ?? 0),
        createdAt: Number(rec.createdAt ?? 0),
        downloadUrl: rec.downloadUrl,
      }))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 200);
  }

  /** 删除录播记录 */
  async deleteRecording(recordingId: string, adminId: string) {
    const r = redis();
    const rec = await r.hgetall(Keys.recording(recordingId));
    if (!rec || !rec.id) throw new BizException(ErrorCode.NOT_FOUND, "录播不存在", 404);
    await redisPipeline((p) => {
      p.del(Keys.recording(recordingId));
      if (rec.roomId) p.zrem(`room:recordings:${rec.roomId}`, recordingId);
    });
    await writeAdminAuditLog("admin_recording_delete", adminId, { recordingId, roomId: rec.roomId });
    return { ok: true };
  }

  async listWithdrawals(status: string) {
    return this.wallet.listWithdrawalsByStatus(status);
  }

  async processWithdrawal(id: string, action: "approve" | "reject", adminId: string) {
    const result = await this.wallet.adminProcessWithdrawal(id, action, adminId);
    await writeAdminAuditLog(`withdrawal_${action}`, adminId, { id });
    return result;
  }

  /** 手动补单（支付回调丢失时人工入账） */
  async completeOrder(orderId: string, adminId: string) {
    const result = await this.wallet.adminCompleteOrder(orderId);
    await writeAdminAuditLog("admin_order_complete", adminId, { orderId, coins: result.coins });
    return result;
  }

  async listOrders() {
    const ids = await redis().zrevrange(Keys.paymentOrdersByStatus("paid"), 0, 99);
    const pending = await redis().zrevrange(Keys.paymentOrdersByStatus("pending"), 0, 99);
    const all = [...ids, ...pending];
    if (all.length === 0) return [];
    const rows = await redisPipeline<Record<string, string>>((p) => {
      for (const id of all) p.hgetall(Keys.paymentOrder(id));
    });
    return rows.filter((r) => r && r.id).map((r) => ({
      id: r.id,
      userId: r.userId,
      amount: Number(r.amount),
      coins: Number(r.coins),
      provider: r.provider,
      status: r.status,
      createdAt: Number(r.createdAt),
    }));
  }

  async listRoles() {
    const raw = await redis().hgetall(Keys.adminRoles);
    return Object.entries(raw).map(([roleId, permsJson]) => {
      let permissions: string[] = [];
      try {
        permissions = JSON.parse(permsJson);
      } catch {
        permissions = [];
      }
      return { roleId, permissions };
    });
  }

  async updateRole(roleId: string, permissions: string[]) {
    if (roleId === "super_admin") {
      await redis().hset(Keys.adminRoles, roleId, JSON.stringify(DEFAULT_ADMIN_PERMISSIONS));
      invalidateAdminContext();
      return { ok: true };
    }
    await redis().hset(Keys.adminRoles, roleId, JSON.stringify(permissions ?? []));
    // 角色权限变化影响所有挂该角色的用户，清空全部管理员上下文缓存
    invalidateAdminContext();
    return { ok: true };
  }

  async setUserRole(userId: string, roleId: string | null) {
    const user = await getUserById(userId);
    if (!user) throw new Error("user_not_found");
    if (roleId) await redis().hset(Keys.adminUserRoles, userId, roleId);
    else await redis().hdel(Keys.adminUserRoles, userId);
    invalidateAdminContext(userId);
    return { ok: true };
  }

  async listUserRoles() {
    return redis().hgetall(Keys.adminUserRoles);
  }

  async listAudit(limit = 100) {
    const entries = await redis().lrange(Keys.adminAuditLog, 0, limit - 1);
    return entries.map((e) => {
      try {
        return JSON.parse(e);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  async listSensitiveWords() {
    return redis().smembers(Keys.adminSensitiveWords);
  }

  async addSensitiveWord(word: string, adminId: string) {
    if (!word) return { ok: true };
    await redis().sadd(Keys.adminSensitiveWords, word);
    invalidateCache("sensitive_words");
    await writeAdminAuditLog("sensitive_word_add", adminId, { word });
    return { ok: true };
  }

  async removeSensitiveWord(word: string, adminId: string) {
    await redis().srem(Keys.adminSensitiveWords, word);
    invalidateCache("sensitive_words");
    await writeAdminAuditLog("sensitive_word_remove", adminId, { word });
    return { ok: true };
  }

  async listReports(status?: string) {
    return this.moderation.listReports(status);
  }

  async processReport(reportId: string, action: "resolve" | "dismiss", adminId: string) {
    const result = await this.moderation.processReport(reportId, action, adminId);
    await writeAdminAuditLog(`report_${action}`, adminId, { reportId });
    return result;
  }

  async getFeatures() {
    return this.system.getFeatures();
  }

  async updateFeatures(features: Record<string, boolean | string>, adminId: string) {
    const before = await this.system.getFeatures();
    for (const [k, v] of Object.entries(features)) {
      await this.system.setFeature(k, v);
    }
    await writeAdminAuditLog("features_update", adminId, features);
    const after = await this.system.getFeatures();
    // 维护模式开/关：强制所有在线页面刷新，立即进入/退出维护页
    if (before.maintenanceEnabled !== after.maintenanceEnabled) {
      const { EVT, publishEvent } = await import("../common/event-bus");
      publishEvent(EVT.SYSTEM_RELOAD, { reason: "maintenance", ts: Date.now() });
    }
    return after;
  }

  /** 批量执行器：逐项执行、单项失败不阻断，返回成功数与失败明细 */
  private async runBatch(
    ids: string[],
    fn: (id: string) => Promise<unknown>,
  ): Promise<{ ok: true; succeeded: number; failed: { id: string; error: string }[] }> {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BizException(ErrorCode.INVALID_AMOUNT, "未选择任何项");
    }
    if (ids.length > 200) {
      throw new BizException(ErrorCode.INVALID_AMOUNT, "单次批量最多 200 项");
    }
    const failed: { id: string; error: string }[] = [];
    let succeeded = 0;
    for (const id of ids) {
      try {
        await fn(id);
        succeeded++;
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : "失败" });
      }
    }
    return { ok: true, succeeded, failed };
  }

  batchUserFlag(userIds: string[], field: "banned" | "muted", value: boolean, adminId: string) {
    return this.runBatch(userIds, (id) => this.setUserFlag(id, field, value, adminId));
  }

  batchRoom(roomIds: string[], action: "ban" | "unban" | "delete", adminId: string) {
    return this.runBatch(roomIds, (id) =>
      action === "delete"
        ? this.adminRoomDelete(id, adminId)
        : this.adminRoomBan(id, action === "ban", adminId),
    );
  }

  batchRecordingDelete(recordingIds: string[], adminId: string) {
    return this.runBatch(recordingIds, (id) => this.deleteRecording(id, adminId));
  }

  batchWithdrawal(ids: string[], action: "approve" | "reject", adminId: string) {
    return this.runBatch(ids, (id) => this.processWithdrawal(id, action, adminId));
  }

  /** 强制刷新全部在线页面（前端资源更新、紧急公告等场景） */
  async broadcastReload(adminId: string) {
    const { EVT, publishEvent } = await import("../common/event-bus");
    publishEvent(EVT.SYSTEM_RELOAD, { reason: "admin", ts: Date.now() });
    await writeAdminAuditLog("broadcast_reload", adminId, {});
    return { ok: true };
  }

  /** 支付网关可后台配置的字段（白名单）与其中的敏感项 */
  private static readonly PAYMENT_FIELDS: Record<string, string[]> = {
    // mock 无凭据可配，仅支持启停（是否注册仍由 PAYMENT_MOCK_ENABLED/NODE_ENV 决定）
    mock: ["enabled"],
    epay: ["pid", "key", "gateway", "enabled"],
    alipay: ["appId", "privateKey", "alipayPublicKey", "gateway", "enabled"],
    stripe: ["secretKey", "webhookSecret", "currency", "enabled"],
  };
  private static readonly PAYMENT_SECRET_FIELDS = new Set([
    "key",
    "privateKey",
    "secretKey",
    "webhookSecret",
  ]);

  private static maskSecret(v: string): string {
    if (v.length <= 8) return "••••••••";
    return `${v.slice(0, 4)}••••${v.slice(-4)}`;
  }

  /** 各网关配置/启用状态总览（可同时启用多个） */
  async paymentGateways() {
    return this.payment.gatewayStatus();
  }

  async getPaymentConfig(provider: string) {
    const fields = AdminService.PAYMENT_FIELDS[provider];
    if (!fields) throw new BizException(ErrorCode.NOT_FOUND, "未知支付网关", 404);
    const stored = (await redis().hgetall(Keys.paymentConfig(provider))) ?? {};
    const config: Record<string, string> = {};
    for (const f of fields) {
      const v = stored[f] ?? "";
      config[f] = v && AdminService.PAYMENT_SECRET_FIELDS.has(f) ? AdminService.maskSecret(v) : v;
    }
    return { provider, config };
  }

  /** 敏感字段回显为掩码；提交时含「••」的值视为未修改，空字符串表示清除（回退环境变量） */
  async updatePaymentConfig(provider: string, partial: Record<string, string>, adminId: string) {
    const fields = AdminService.PAYMENT_FIELDS[provider];
    if (!fields) throw new BizException(ErrorCode.NOT_FOUND, "未知支付网关", 404);
    const key = Keys.paymentConfig(provider);
    const changed: string[] = [];
    for (const f of fields) {
      if (!(f in partial)) continue;
      const v = String(partial[f] ?? "").trim();
      if (v.includes("••")) continue; // 掩码原样提交 = 未修改
      if (v === "") {
        await redis().hdel(key, f);
      } else {
        await redis().hset(key, f, v);
      }
      changed.push(f);
    }
    // 审计只记字段名，不落密钥明文
    await writeAdminAuditLog("payment_config_update", adminId, { provider, changed });
    return this.getPaymentConfig(provider);
  }

  async getConfig() {
    return this.system.getConfig();
  }

  async updateConfig(config: Record<string, string>, adminId: string) {
    await this.system.setConfig(config);
    await writeAdminAuditLog("config_update", adminId, config);
    return this.system.getConfig();
  }

  async setAnnouncement(input: { title: string; content: string }, adminId: string) {
    await this.system.setConfig({
      announcement_title: input.title ?? "",
      announcement: input.content ?? "",
    });
    await writeAdminAuditLog("announcement_update", adminId);
    return { ok: true };
  }

  async danmakuList(roomId: string, limit = 100) {
    const members = await redis().zrevrange(Keys.danmakuZset(roomId), 0, limit - 1);
    return members
      .map((m) => {
        try {
          return JSON.parse(m);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
}
