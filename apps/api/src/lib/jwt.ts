import { sign, verify } from "hono/jwt";
import type { AuthPayload } from "../types";

const TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12 ساعة (مبسّط لنسخة MVP)

export async function issueToken(
  secret: string,
  payload: Omit<AuthPayload, "exp" | "iat">,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { ...payload, iat: now, exp: now + TOKEN_TTL_SECONDS },
    secret,
  );
}

export async function readToken(
  secret: string,
  token: string,
): Promise<AuthPayload | null> {
  try {
    return (await verify(token, secret, "HS256")) as AuthPayload;
  } catch {
    return null;
  }
}
