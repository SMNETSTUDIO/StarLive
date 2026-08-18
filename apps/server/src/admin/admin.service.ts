import { Injectable } from "@nestjs/common";
import { ErrorCode, Keys } from "@starlive/shared";
import { writeAdminAuditLog } from "../common/audit";
import { DEFAULT_ADMIN_PERMISSIONS } from "../common/permissions";
import { redis, redisPipeline } from "../common/redis";
import { getRoom } from "../common/room-store";
import { getUserById, setUserField } from "../common/user-store";
import { ModerationService } from "../moderation/moderation.service";
import { SystemService } from "../system/system.service";
import { WalletService } from "../wallet/wallet.service";

@Injectable()
export class AdminService {
  constructor(
    private readonly wallet: WalletService,
    private readonly moderation: ModerationService,
    private readonly system: SystemService,
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

  async listUsers() {
    const ids = await redis().smembers(Keys.usersSet);
    const rows = await redisPipeline<Record<string, string>>((p) => {
      for (const id of ids) p.hgetall(Keys.user(id));
    });
    return rows
      .filter((u) => u && u.id)
      .map((u) => ({
        id: u.id,
        name: u.name ?? u.username,
        username: u.username,
        email: u.email,
        avatarUrl: u.avatarUrl,
        banned: u.banned === "true",
        muted: u.muted === "true",
        createdAt: Number(u.createdAt ?? 0),
      }));
  }

  async setUserFlag(userId: string, field: "banned" | "muted", value: boolean, adminId: string) {
    await setUserField(userId, field, value ? "true" : "false");
    await writeAdminAuditLog(`user_${field}_${value}`, adminId, { userId });
    return { ok: true };
  }

  async listRooms() {
    const ids = await redis().smembers(Keys.roomsSet);
    const rows = await redisPipeline<string[]>((p) => {
      for (const id of ids) p.hmget(Keys.room(id), "id", "title", "ownerId", "isPublic", "category", "status", "banned", "createdAt");
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
      }));
  }

  async adminRoomUpdate(roomId: string, input: { title?: string; isPublic?: boolean }, adminId: string) {
    const room = await getRoom(roomId);
    if (!room) throw new Error("room_not_found");
    const r = redis();
    if (input.title !== undefined) await r.hset(Keys.room(roomId), "title", input.title);
    if (input.isPublic !== undefined) {
      await r.hset(Keys.room(roomId), "isPublic", input.isPublic ? "true" : "false");
      if (input.isPublic) await r.sadd(Keys.publicRoomsSet, roomId);
      else await r.srem(Keys.publicRoomsSet, roomId);
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

  async listWithdrawals(status: string) {
    return this.wallet.listWithdrawalsByStatus(status);
  }

  async processWithdrawal(id: string, action: "approve" | "reject", adminId: string) {
    const result = await this.wallet.adminProcessWithdrawal(id, action, adminId);
    await writeAdminAuditLog(`withdrawal_${action}`, adminId, { id });
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
    await writeAdminAuditLog("sensitive_word_add", adminId, { word });
    return { ok: true };
  }

  async removeSensitiveWord(word: string, adminId: string) {
    await redis().srem(Keys.adminSensitiveWords, word);
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
