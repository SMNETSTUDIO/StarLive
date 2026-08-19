import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { ErrorCode, Keys } from "@starlive/shared";
import { BizException } from "../common/errors";
import { redis } from "../common/redis";
import { signJwt } from "../common/jwt";
import { invalidateAdminContext, resolveAdmin } from "../common/admin";
import {
  createUser,
  getUserByEmail,
  getUserById,
  getUserByUsername,
  setUserField,
  toProfile,
} from "../common/user-store";
import { config } from "../config/config";

@Injectable()
export class AuthService {
  /** 首次部署检测：Redis 中是否已存在超级管理员 */
  async needsSetup(): Promise<boolean> {
    if (config.adminUserIds.length > 0) return false;
    const r = redis();
    if (await r.get(Keys.systemSetupDone)) return false;
    // 兼容旧部署：RBAC 中已有 super_admin 则视为已初始化
    const roles = await r.hvals(Keys.adminUserRoles);
    if (roles.includes("super_admin")) {
      await r.set(Keys.systemSetupDone, "1");
      return false;
    }
    return true;
  }

  /** 首次部署：创建超级管理员账号并登录 */
  async setupAdmin(input: {
    username: string;
    password: string;
    email?: string;
  }): Promise<{ user: ReturnType<typeof toProfile>; token: string }> {
    if (!(await this.needsSetup())) {
      throw new BizException(ErrorCode.FORBIDDEN, "系统已完成初始化", 403);
    }
    const r = redis();
    // NX 锁防止并发重复初始化
    const locked = await r.set(Keys.systemSetupDone, "pending", "EX", 60, "NX");
    if (!locked) {
      throw new BizException(ErrorCode.FORBIDDEN, "系统正在初始化或已完成", 403);
    }
    try {
      const created = await this.register(input);
      await r.hset(Keys.adminUserRoles, created.id, "super_admin");
      // 保持「每次写 adminUserRoles 必失效缓存」的不变量（见 common/admin.ts）
      invalidateAdminContext(created.id);
      await r.set(Keys.systemSetupDone, "1");
      return this.login({ account: created.username, password: input.password });
    } catch (err) {
      await r.del(Keys.systemSetupDone).catch(() => undefined);
      throw err;
    }
  }

  async register(input: {
    username: string;
    password: string;
    email?: string;
  }): Promise<{ id: string; username: string }> {
    // 系统开关：管理后台可关闭开放注册（默认开启）
    const regFlag = await redis().hget(Keys.systemFeatures, "registrationEnabled");
    if (regFlag === "false" || regFlag === "0") {
      throw new BizException(ErrorCode.FORBIDDEN, "注册已关闭，请联系管理员", 403);
    }
    const username = (input.username ?? "").trim();
    const email = (input.email ?? "").trim() || undefined;

    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(username)) {
      throw new BizException(ErrorCode.INVALID_AMOUNT, "用户名需 2-20 位字符");
    }
    if (!input.password || input.password.length < 6) {
      throw new BizException(ErrorCode.INVALID_AMOUNT, "密码至少 6 位");
    }
    if (await getUserByUsername(username)) {
      throw new BizException(ErrorCode.INVALID_AMOUNT, "用户名已被占用");
    }
    if (email && (await getUserByEmail(email))) {
      throw new BizException(ErrorCode.INVALID_AMOUNT, "邮箱已被占用");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await createUser({ username, email, passwordHash });
    return { id: user.id, username: user.username };
  }

  async login(input: {
    account: string;
    password: string;
  }): Promise<{ user: ReturnType<typeof toProfile>; token: string }> {
    const account = (input.account ?? "").trim();
    let user =
      (await getUserByUsername(account)) ??
      (await getUserByEmail(account));
    if (!user || !user.passwordHash) {
      throw new BizException(ErrorCode.UNAUTHORIZED, "账号或密码错误", 401);
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new BizException(ErrorCode.UNAUTHORIZED, "账号或密码错误", 401);
    }
    if (user.banned === "true" || user.banned === "1") {
      throw new BizException(ErrorCode.BANNED, "账号已被封禁", 403);
    }
    const admin = await resolveAdmin(user.id);
    const token = await signJwt({
      sub: user.id,
      name: user.name ?? user.username,
      username: user.username,
      isSuperAdmin: admin.isSuperAdmin,
      permissions: admin.permissions,
    });
    return { user: toProfile(user), token };
  }

  async me(userId: string) {
    const user = await getUserById(userId);
    if (!user) return null;
    const admin = await resolveAdmin(userId);
    return {
      ...toProfile(user),
      isSuperAdmin: admin.isSuperAdmin,
      roleId: (await this.roleId(userId)) ?? undefined,
      permissions: admin.permissions,
    };
  }

  /** 用户更新自己的资料 */
  async updateProfile(
    userId: string,
    input: { name?: string; email?: string; avatarUrl?: string },
  ) {
    const user = await getUserById(userId);
    if (!user) throw new BizException(ErrorCode.UNAUTHORIZED, "未登录", 401);
    const r = redis();
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > 20) {
        throw new BizException(ErrorCode.INVALID_AMOUNT, "昵称需 1-20 位字符");
      }
      await setUserField(userId, "name", name);
    }
    if (input.email !== undefined) {
      const email = input.email.trim();
      if (email !== (user.email ?? "")) {
        if (email) {
          const existing = await r.get(Keys.userByEmail(email));
          if (existing && existing !== userId) {
            throw new BizException(ErrorCode.INVALID_AMOUNT, "邮箱已被占用");
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
    return this.me(userId);
  }

  /** 用户修改自己的密码（OAuth 无密码账号可直接设置） */
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await getUserById(userId);
    if (!user) throw new BizException(ErrorCode.UNAUTHORIZED, "未登录", 401);
    if (!newPassword || newPassword.length < 6) {
      throw new BizException(ErrorCode.INVALID_AMOUNT, "新密码至少 6 位");
    }
    if (user.passwordHash) {
      const ok = await bcrypt.compare(oldPassword ?? "", user.passwordHash);
      if (!ok) throw new BizException(ErrorCode.UNAUTHORIZED, "当前密码错误", 401);
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await setUserField(userId, "passwordHash", hash);
    return { ok: true };
  }

  async roleId(userId: string): Promise<string | null> {
    const { redis } = await import("../common/redis");
    return redis().hget("admin:user_roles", userId);
  }

  async guest(): Promise<{ guestId: string }> {
    return { guestId: `g_${randomUUID()}` };
  }

  /** OAuth 是否已配置（前端据此决定是否展示入口；后台面板配置优先） */
  async oauthStatus(): Promise<{ enabled: boolean; name: string }> {
    const { getOAuthConfig } = await import("../common/runtime-config");
    const oauth = await getOAuthConfig();
    return {
      enabled: Boolean(oauth.clientId && oauth.authUrl),
      name: oauth.providerName,
    };
  }

  async oauthAuthorizeUrl(redirect: string): Promise<string> {
    const { getOAuthConfig } = await import("../common/runtime-config");
    const oauth = await getOAuthConfig();
    if (!oauth.clientId || !oauth.authUrl) {
      throw new BizException(ErrorCode.INTERNAL, "OAuth 未配置");
    }
    const params = new URLSearchParams({
      client_id: oauth.clientId,
      redirect_uri: oauth.redirectUri,
      response_type: "code",
      scope: "read",
      state: encodeURIComponent(redirect || "/"),
    });
    return `${oauth.authUrl}?${params.toString()}`;
  }

  /** 用授权码换取 OAuth 身份（token 交换 + 用户信息） */
  private async fetchOAuthIdentity(code: string): Promise<{
    oauthId: string;
    info: { id?: number | string; username?: string; name?: string; avatar_url?: string; email?: string };
  }> {
    const { getOAuthConfig } = await import("../common/runtime-config");
    const oauth = await getOAuthConfig();
    // OAuth2 标准要求 token 端点用 form-urlencoded（linux.do 等不解析 JSON body）
    const tokenRes = await fetch(oauth.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
        code,
        redirect_uri: oauth.redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    const tokenData = (await tokenRes.json().catch(() => ({}))) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenData.access_token) {
      const detail = tokenData.error_description || tokenData.error || `HTTP ${tokenRes.status}`;
      throw new BizException(ErrorCode.UNAUTHORIZED, `OAuth 授权失败：${detail}`, 401);
    }
    const infoRes = await fetch(oauth.userInfoUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const info = (await infoRes.json()) as {
      id?: number | string;
      username?: string;
      name?: string;
      avatar_url?: string;
      email?: string;
    };
    const oauthId = String(info.id ?? info.username ?? "");
    if (!oauthId) {
      throw new BizException(ErrorCode.UNAUTHORIZED, "OAuth 用户信息缺失", 401);
    }
    return { oauthId, info };
  }

  async oauthLogin(code: string): Promise<{ user: ReturnType<typeof toProfile>; token: string }> {
    const { oauthId, info } = await this.fetchOAuthIdentity(code);

    // 1) 绑定索引优先：已绑定的注册账号直接登录
    const boundId = await redis().get(Keys.oauthUid(oauthId));
    let user = boundId ? await getUserById(boundId) : null;

    // 2) 兼容历史 oauth_ 独立账号，并回填索引
    if (!user) {
      const username = `oauth_${oauthId}`;
      user = await getUserByUsername(username);
      if (user) await redis().set(Keys.oauthUid(oauthId), user.id);
    }

    // 3) 都没有则创建新账号（受「开放注册」开关约束，已有账号不受影响）
    if (!user) {
      const regFlag = await redis().hget(Keys.systemFeatures, "registrationEnabled");
      if (regFlag === "false" || regFlag === "0") {
        throw new BizException(ErrorCode.FORBIDDEN, "注册已关闭，请联系管理员", 403);
      }
      const username = `oauth_${oauthId}`;
      user = await createUser({
        username,
        name: info.name ?? info.username ?? username,
        email: info.email,
        passwordHash: "",
      });
      await redis().set(Keys.oauthUid(oauthId), user.id);
      await setUserField(user.id, "oauthId", oauthId);
      await setUserField(user.id, "oauthName", info.username ?? info.name ?? "");
      if (info.avatar_url) {
        await setUserField(user.id, "avatarUrl", info.avatar_url);
      }
    }
    const admin = await resolveAdmin(user.id);
    const token = await signJwt({
      sub: user.id,
      name: user.name ?? user.username,
      username: user.username,
      isSuperAdmin: admin.isSuperAdmin,
      permissions: admin.permissions,
    });
    return { user: toProfile(user), token };
  }

  /** 发起绑定：生成一次性 nonce（防 CSRF 绑定劫持），跳转授权页 */
  async oauthBindUrl(userId: string): Promise<string> {
    const { getOAuthConfig } = await import("../common/runtime-config");
    const oauth = await getOAuthConfig();
    if (!oauth.clientId || !oauth.authUrl) {
      throw new BizException(ErrorCode.INTERNAL, "OAuth 未配置");
    }
    const nonce = randomUUID().replace(/-/g, "");
    await redis().set(Keys.oauthBindNonce(nonce), userId, "EX", 600);
    const params = new URLSearchParams({
      client_id: oauth.clientId,
      redirect_uri: oauth.redirectUri,
      response_type: "code",
      scope: "read",
      state: `bind:${nonce}`,
    });
    return `${oauth.authUrl}?${params.toString()}`;
  }

  /** 完成绑定：nonce 换回发起用户，将 OAuth 身份挂到该账号 */
  async oauthBind(code: string, nonce: string): Promise<void> {
    const key = Keys.oauthBindNonce(nonce);
    const userId = await redis().get(key);
    if (!userId) {
      throw new BizException(ErrorCode.UNAUTHORIZED, "绑定会话已过期，请重新发起", 401);
    }
    await redis().del(key);

    const user = await getUserById(userId);
    if (!user) throw new BizException(ErrorCode.NOT_FOUND, "用户不存在", 404);

    const { oauthId, info } = await this.fetchOAuthIdentity(code);

    const existing = await redis().get(Keys.oauthUid(oauthId));
    if (existing && existing !== userId) {
      throw new BizException(ErrorCode.FORBIDDEN, "该 OAuth 账号已绑定其他用户", 403);
    }
    // 该 OAuth 身份已有历史独立账号（oauth_xxx）时禁止绑定，避免一个身份两个账号
    const legacy = await getUserByUsername(`oauth_${oauthId}`);
    if (legacy && legacy.id !== userId) {
      throw new BizException(ErrorCode.FORBIDDEN, "该 OAuth 账号已有独立账号，请直接用它登录", 403);
    }

    // 换绑：清掉本账号旧的 OAuth 索引
    const prevOauthId = (user as { oauthId?: string }).oauthId;
    if (prevOauthId && prevOauthId !== oauthId) {
      await redis().del(Keys.oauthUid(prevOauthId));
    }
    await redis().set(Keys.oauthUid(oauthId), userId);
    await setUserField(userId, "oauthId", oauthId);
    await setUserField(userId, "oauthName", info.username ?? info.name ?? "");
  }

  async oauthBindStatus(userId: string): Promise<{ bound: boolean; boundName: string }> {
    const user = await getUserById(userId);
    const raw = user as { oauthId?: string; oauthName?: string } | null;
    return {
      bound: Boolean(raw?.oauthId),
      boundName: raw?.oauthName ?? "",
    };
  }

  async oauthUnbind(userId: string): Promise<{ ok: boolean }> {
    const user = await getUserById(userId);
    const raw = user as ({ oauthId?: string } & typeof user) | null;
    if (!raw?.oauthId) {
      throw new BizException(ErrorCode.NOT_FOUND, "当前未绑定 OAuth 账号", 404);
    }
    // 没有密码的账号解绑后将无法登录，先设置密码
    if (!user?.passwordHash) {
      throw new BizException(ErrorCode.FORBIDDEN, "请先在下方设置登录密码，再解绑", 403);
    }
    await redis().del(Keys.oauthUid(raw.oauthId));
    await redis().hdel(Keys.user(userId), "oauthId", "oauthName");
    return { ok: true };
  }
}
