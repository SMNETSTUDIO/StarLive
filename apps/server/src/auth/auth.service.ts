import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { ErrorCode } from "@starlive/shared";
import { BizException } from "../common/errors";
import { signJwt } from "../common/jwt";
import { resolveAdmin } from "../common/admin";
import {
  createUser,
  getUserByEmail,
  getUserById,
  getUserByUsername,
  toProfile,
} from "../common/user-store";
import { config } from "../config/config";

@Injectable()
export class AuthService {
  async register(input: {
    username: string;
    password: string;
    email?: string;
  }): Promise<{ id: string; username: string }> {
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

  async roleId(userId: string): Promise<string | null> {
    const { redis } = await import("../common/redis");
    return redis().hget("admin:user_roles", userId);
  }

  async guest(): Promise<{ guestId: string }> {
    return { guestId: `g_${randomUUID()}` };
  }

  async oauthAuthorizeUrl(redirect: string): Promise<string> {
    const base = config.oauthAuthUrl;
    if (!config.oauthClientId || !base) {
      throw new BizException(ErrorCode.INTERNAL, "OAuth 未配置");
    }
    const params = new URLSearchParams({
      client_id: config.oauthClientId,
      redirect_uri: config.oauthRedirectUri,
      response_type: "code",
      scope: "read",
      state: encodeURIComponent(redirect || "/"),
    });
    return `${base}?${params.toString()}`;
  }

  async oauthLogin(code: string): Promise<{ user: ReturnType<typeof toProfile>; token: string }> {
    const tokenRes = await fetch(config.oauthTokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: config.oauthClientId,
        client_secret: config.oauthClientSecret,
        code,
        redirect_uri: config.oauthRedirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      throw new BizException(ErrorCode.UNAUTHORIZED, "OAuth 授权失败", 401);
    }
    const infoRes = await fetch(config.oauthUserInfoUrl, {
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
    const username = `oauth_${oauthId}`;
    let user = await getUserByUsername(username);
    if (!user) {
      user = await createUser({
        username,
        name: info.name ?? info.username ?? username,
        email: info.email,
        passwordHash: "",
      });
      if (info.avatar_url) {
        const { setUserField } = await import("../common/user-store");
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
}
