import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { config } from "../config/config";
import { verifyJwt, type JwtPayload } from "./jwt";

export interface AuthedRequest extends Request {
  user?: JwtPayload;
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function extractSessionToken(req: Request): string | undefined {
  const cookies = parseCookies(req);
  return cookies[config.sessionCookie];
}

function extractViewerToken(req: Request): string | undefined {
  const cookies = parseCookies(req);
  return cookies[config.viewerCookie];
}

/** 校验登录态，将用户信息挂载到 req.user */
@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = extractSessionToken(req);
    if (!token) throw new UnauthorizedException("not_authenticated");
    const payload = await verifyJwt(token);
    if (!payload) throw new UnauthorizedException("invalid_token");
    req.user = payload;
    return true;
  }
}

/** 可选登录态（游客也可访问） */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = extractSessionToken(req);
    if (token) {
      const payload = await verifyJwt(token);
      if (payload) req.user = payload;
    }
    return true;
  }
}

/** 管理员鉴权（含权限点校验） */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly permission?: string) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = extractSessionToken(req);
    if (!token) throw new UnauthorizedException("not_authenticated");
    const payload = await verifyJwt(token);
    if (!payload) throw new UnauthorizedException("invalid_token");
    if (payload.isSuperAdmin || config.adminUserIds.includes(payload.sub)) {
      req.user = payload;
      return true;
    }
    const permissions = payload.permissions ?? [];
    if (!this.permission || permissions.includes(this.permission) || permissions.includes("*")) {
      req.user = payload;
      return true;
    }
    throw new ForbiddenException("no_permission");
  }
}

export function getViewerToken(req: Request): string | undefined {
  return extractViewerToken(req);
}

/** 任意管理员鉴权（实时解析角色权限） */
@Injectable()
export class RequireAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = extractSessionToken(req);
    if (!token) throw new UnauthorizedException("not_authenticated");
    const payload = await verifyJwt(token);
    if (!payload) throw new UnauthorizedException("invalid_token");

    const { resolveAdmin } = await import("./admin");
    const admin = await resolveAdmin(payload.sub);
    if (!admin.isSuperAdmin && admin.permissions.length === 0) {
      throw new ForbiddenException("no_permission");
    }
    req.user = payload;
    return true;
  }
}

/** 超级管理员鉴权 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = extractSessionToken(req);
    if (!token) throw new UnauthorizedException("not_authenticated");
    const payload = await verifyJwt(token);
    if (!payload) throw new UnauthorizedException("invalid_token");

    const { resolveAdmin } = await import("./admin");
    const admin = await resolveAdmin(payload.sub);
    if (!admin.isSuperAdmin) {
      throw new ForbiddenException("super_admin_required");
    }
    req.user = payload;
    return true;
  }
}
