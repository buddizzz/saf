import { createMiddleware } from "hono/factory";
import type { Env, AuthPayload, AdminAuthPayload, AdminRole } from "../types";
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
  if (!payload || payload.role === "admin") {
    return c.json({ error: "جلسة غير صالحة" }, 401);
  }
  c.set("auth", payload as AuthPayload);
  await next();
});

export const requireAdmin = createMiddleware<{
  Bindings: Env;
  Variables: { admin: AdminAuthPayload };
}>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "غير مصرّح" }, 401);
  }
  const payload = await readToken(c.env.JWT_SECRET, header.slice(7));
  if (!payload || payload.role !== "admin") {
    return c.json({ error: "جلسة أدمن غير صالحة" }, 401);
  }
  c.set("admin", payload as AdminAuthPayload);
  await next();
});

export function requireAdminRoles(...roles: AdminRole[]) {
  return createMiddleware<{
    Bindings: Env;
    Variables: { admin: AdminAuthPayload };
  }>(async (c, next) => {
    const admin = c.get("admin");
    if (!admin || !roles.includes(admin.adminRole)) {
      return c.json({ error: "صلاحيات غير كافية" }, 403);
    }
    await next();
  });
}
