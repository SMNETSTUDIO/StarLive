import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { config } from "../config/config";
import { AuthGuard, OptionalAuthGuard, type AuthedRequest } from "../common/guards";
import { AuthService } from "./auth.service";

function setSessionCookie(res: Response, token: string): void {
  res.cookie(config.sessionCookie, token, {
    httpOnly: true,
    maxAge: config.sessionTtl * 1000,
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure || config.appBaseUrl.startsWith("https"),
    path: "/",
  });
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("setup-status")
  async setupStatus() {
    return { needsSetup: await this.auth.needsSetup() };
  }

  @Post("setup")
  async setup(
    @Body() body: { username: string; password: string; email?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.setupAdmin(body);
    setSessionCookie(res, token);
    return { user };
  }

  @Post("register")
  async register(
    @Body() body: { username: string; password: string; email?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const created = await this.auth.register(body);
    const { token } = await this.auth.login({
      account: created.username,
      password: body.password,
    });
    setSessionCookie(res, token);
    return { user: created };
  }

  @Post("login")
  async login(
    @Body() body: { account: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.login(body);
    setSessionCookie(res, token);
    return { user };
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(config.sessionCookie, { path: "/" });
    return { ok: true };
  }

  @Get("me")
  @UseGuards(OptionalAuthGuard)
  async me(@Req() req: AuthedRequest) {
    if (!req.user?.sub) return { user: null };
    return { user: await this.auth.me(req.user.sub) };
  }

  @Post("profile-update")
  @UseGuards(AuthGuard)
  async profileUpdate(
    @Req() req: AuthedRequest,
    @Body() body: { name?: string; email?: string; avatarUrl?: string },
  ) {
    return { user: await this.auth.updateProfile(req.user!.sub, body) };
  }

  @Post("password-change")
  @UseGuards(AuthGuard)
  passwordChange(
    @Req() req: AuthedRequest,
    @Body() body: { oldPassword?: string; newPassword: string },
  ) {
    return this.auth.changePassword(req.user!.sub, body.oldPassword ?? "", body.newPassword);
  }

  @Post("guest")
  async guest(@Res({ passthrough: true }) res: Response) {
    const { guestId } = await this.auth.guest();
    res.cookie(config.viewerCookie, guestId, {
      httpOnly: true,
      maxAge: config.sessionTtl * 1000,
      sameSite: config.cookieSameSite,
      secure: config.cookieSecure || config.appBaseUrl.startsWith("https"),
      path: "/",
    });
    return { guestId };
  }

  @Get("oauth-initiate")
  async oauthInitiate(
    @Query("redirect") redirect: string,
    @Res() res: Response,
  ) {
    const url = await this.auth.oauthAuthorizeUrl(redirect);
    res.redirect(url);
  }

  @Get("oauth-callback")
  async oauthCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() res: Response,
  ) {
    const { token } = await this.auth.oauthLogin(code);
    setSessionCookie(res, token);
    const redirect = state ? decodeURIComponent(state) : "/";
    res.redirect(redirect);
  }
}
