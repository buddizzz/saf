import { Hono } from "hono";
import type { AppEnv } from "../lib/http";
import { isValidEmail, requireFields } from "../lib/http";
import { hashPassword, verifyPassword } from "../lib/crypto";
import { generateId } from "../lib/slug";
import { issueToken } from "../lib/jwt";
import { requireAuth } from "../middleware/auth";

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/register", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const err = requireFields(body, ["name", "email", "password"]);
  if (err) return c.json({ error: err }, 400);
  if (!isValidEmail(body.email)) {
    return c.json({ error: "صيغة البريد الإلكتروني غير صحيحة" }, 400);
  }
  if (String(body.password).length < 8) {
    return c.json({ error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" }, 400);
  }

  const existing = await c.env.DB.prepare("SELECT id FROM owners WHERE email = ?")
    .bind(body.email)
    .first();
  if (existing) {
    return c.json({ error: "البريد الإلكتروني مسجّل مسبقًا" }, 409);
  }

  const id = generateId("own");
  const passwordHash = await hashPassword(body.password);
  await c.env.DB.prepare(
    "INSERT INTO owners (id, email, password_hash, name, phone) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, body.email, passwordHash, body.name, body.phone ?? null)
    .run();

  const token = await issueToken(c.env.JWT_SECRET, {
    sub: id,
    email: body.email,
    role: "owner",
  });
  return c.json({ token, owner: { id, name: body.name, email: body.email } }, 201);
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const err = requireFields(body, ["email", "password"]);
  if (err) return c.json({ error: err }, 400);

  const owner = await c.env.DB.prepare(
    "SELECT id, name, email, password_hash FROM owners WHERE email = ?",
  )
    .bind(body.email)
    .first<{ id: string; name: string; email: string; password_hash: string }>();

  if (!owner || !(await verifyPassword(body.password, owner.password_hash))) {
    return c.json({ error: "بيانات الدخول غير صحيحة" }, 401);
  }

  const token = await issueToken(c.env.JWT_SECRET, {
    sub: owner.id,
    email: owner.email,
    role: "owner",
  });
  return c.json({
    token,
    owner: { id: owner.id, name: owner.name, email: owner.email },
  });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const auth = c.get("auth");
  const owner = await c.env.DB.prepare(
    "SELECT id, name, email, phone FROM owners WHERE id = ?",
  )
    .bind(auth.sub)
    .first();
  if (!owner) return c.json({ error: "غير موجود" }, 404);
  return c.json({ owner });
});
