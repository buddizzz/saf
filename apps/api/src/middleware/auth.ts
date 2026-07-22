import { createMiddleware } from "hono/factory";
import type { Env, AuthPayload } from "../types";
import { readToken } from "../lib/jwt";

// Middleware يتحقق من JWT ويضع الحمولة في السياق تحت المفتاح "auth".
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: { auth: AuthPayload };
}>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "غير مصرّح" }, 401);
  }
  const payload = await readToken(c.env.JWT_SECRET, header.slice(7));
  if (!payload) {
    return c.json({ error: "جلسة غير صالحة" }, 401);
  }
  c.set("auth", payload);
  await next();
});
