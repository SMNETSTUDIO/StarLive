import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { ErrorCode, Keys } from "@starlive/shared";
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
    const items: {
      id: string;
      roomId: string;
      roomTitle: string;
      duration: number;
      createdAt: number;
      downloadUrl?: string;
    }[] = [];
    for (const roomId of roomIds) {
      const recIds = await r.zrange(`room:recordings:${roomId}`, 0, -1);
      if (recIds.length === 0) continue;
      const title = (await r.hget(Keys.room(roomId), "title")) ?? roomId;
      const rows = await redisPipeline<Record<string, string>>((p) => {
        for (const id of recIds) p.hgetall(Keys.recording(id));
      });
      for (const rec of rows) {
        if (!rec || !rec.id) continue;
        items.push({
          id: rec.id,
          roomId,
          roomTitle: title,
          duration: Number(rec.duration ?? 0),
          createdAt: Number(rec.createdAt ?? 0),
          downloadUrl: rec.downloadUrl,
        });
      }
    }
    return items.sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);
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
      return { ok: true };
    }
    await redis().hset(Keys.adminRoles, roleId, JSON.stringify(permissions ?? []));
    return { ok: true };
  }

  async setUserRole(userId: string, roleId: string | null) {
    const user = await getUserById(userId);
    if (!user) throw new Error("user_not_found");
    if (roleId) await redis().hset(Keys.adminUserRoles, userId, roleId);
    else await redis().hdel(Keys.adminUserRoles, userId);
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
    for (const [k, v] of Object.entries(features)) {
      await this.system.setFeature(k, v);
    }
    await writeAdminAuditLog("features_update", adminId, features);
    return this.system.getFeatures();
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
