import { Hono } from "hono";
import type { AppEnv } from "../lib/http";
import { requireFields } from "../lib/http";
import { verifyPassword } from "../lib/crypto";
import { issueToken } from "../lib/jwt";

export const staffRoutes = new Hono<AppEnv>();

// دخول الموظف عبر رمز PIN ضمن نطاق محل واحد.
staffRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const err = requireFields(body, ["slug", "pin"]);
  if (err) return c.json({ error: err }, 400);

  const shop = await c.env.DB.prepare(
    "SELECT id, name FROM shops WHERE slug = ? AND is_active = 1",
  )
    .bind(body.slug)
    .first<{ id: string; name: string }>();
  if (!shop) return c.json({ error: "المحل غير موجود" }, 404);

  const { results } = await c.env.DB.prepare(
    "SELECT id, name, pin_code_hash FROM staff WHERE shop_id = ? AND is_active = 1",
  )
    .bind(shop.id)
    .all<{ id: string; name: string; pin_code_hash: string }>();

  for (const member of results ?? []) {
    if (await verifyPassword(String(body.pin), member.pin_code_hash)) {
      const token = await issueToken(c.env.JWT_SECRET, {
        sub: member.id,
        email: `staff:${member.id}`,
        role: "staff",
        shopScope: shop.id,
      });
      return c.json({
        token,
        staff: { id: member.id, name: member.name },
        shop: { id: shop.id, name: shop.name, slug: body.slug },
      });
    }
  }

  return c.json({ error: "رمز PIN غير صحيح" }, 401);
});
