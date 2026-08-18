import { SignJWT, jwtVerify } from "jose";
import { config } from "../config/config";

export interface JwtPayload {
  sub: string;
  name?: string;
  username?: string;
  isSuperAdmin?: boolean;
  permissions?: string[];
  [key: string]: unknown;
}

function secret(): Uint8Array {
  return new TextEncoder().encode(config.jwtSecret);
}

export async function signJwt(
  payload: JwtPayload,
  ttlSeconds = config.sessionTtl,
): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(secret());
}

export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}
