import { Hono } from "hono";
import type { AppEnv } from "../lib/http";
import { requireFields } from "../lib/http";
import { generateId, generateSlug } from "../lib/slug";
import { hashPassword } from "../lib/crypto";
import { isWithinWorkingHours } from "../lib/hours";
import { requireAuth } from "../middleware/auth";

export const shopRoutes = new Hono<AppEnv>();

const SHOP_TYPES = ["barber", "restaurant", "clinic", "salon", "other"];

// إنشاء محل جديد (يبدأ دائمًا على الباقة المجانية برابط عشوائي).
shopRoutes.post("/", requireAuth, async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json().catch(() => ({}));
  const err = requireFields(body, ["name", "shop_type", "country_code"]);
  if (err) return c.json({ error: err }, 400);
  if (!SHOP_TYPES.includes(body.shop_type)) {
    return c.json({ error: "نوع المحل غير مدعوم" }, 400);
  }

  // توليد رابط عشوائي فريد (إعادة المحاولة عند التصادم النادر).
  let slug = generateSlug();
  for (let i = 0; i < 5; i++) {
    const clash = await c.env.DB.prepare("SELECT id FROM shops WHERE slug = ?")
      .bind(slug)
      .first();
    if (!clash) break;
    slug = generateSlug();
  }

  const id = generateId("shop");
  await c.env.DB.prepare(
    `INSERT INTO shops
      (id, owner_id, name, slug, shop_type, country_code, city_id, district_id, district_name_free, lat, lng, working_hours)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      auth.sub,
      body.name,
      slug,
      body.shop_type,
      body.country_code,
      body.city_id ?? null,
      body.district_id ?? null,
      body.district_name_free ?? null,
      body.lat ?? null,
      body.lng ?? null,
      body.working_hours ? JSON.stringify(body.working_hours) : null,
    )
    .run();

  const shop = await c.env.DB.prepare("SELECT * FROM shops WHERE id = ?")
    .bind(id)
    .first();
  return c.json({ shop }, 201);
});

// قائمة محلات المالك.
shopRoutes.get("/", requireAuth, async (c) => {
  const auth = c.get("auth");
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM shops WHERE owner_id = ? ORDER BY created_at DESC",
  )
    .bind(auth.sub)
    .all();
  return c.json({ shops: results ?? [] });
});

// معلومات عامة للمحل عبر الـ slug (لصفحة العميل).
shopRoutes.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const shop = await c.env.DB.prepare(
    `SELECT id, name, slug, shop_type, theme_id, theme_custom, logo_url,
            is_active, is_accepting_queue, working_hours, subscription_tier, avg_service_seconds
     FROM shops WHERE slug = ?`,
  )
    .bind(slug)
    .first<{
      id: string;
      name: string;
      is_active: number;
      is_accepting_queue: number;
      working_hours: string | null;
      subscription_tier: string;
    }>();

  if (!shop) return c.json({ error: "المحل غير موجود" }, 404);

  const withinHours = isWithinWorkingHours(shop.working_hours);
  const isOpen =
    shop.is_active === 1 && shop.is_accepting_queue === 1 && withinHours;
  let closedReason: string | null = null;
  if (shop.is_accepting_queue !== 1) {
    closedReason = "المحل أوقف استقبال العملاء مؤقتًا";
  } else if (!withinHours) {
    closedReason = "المحل مغلق حاليًا خارج ساعات العمل";
  }

  return c.json({ shop: { ...shop, isOpen, closedReason } });
});

// تحديث المحل (تبديل استقبال العملاء، الثيم، ساعات العمل...).
shopRoutes.patch("/:id", requireAuth, async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const shop = await c.env.DB.prepare(
    "SELECT id FROM shops WHERE id = ? AND owner_id = ?",
  )
    .bind(id, auth.sub)
    .first();
  if (!shop) return c.json({ error: "المحل غير موجود" }, 404);

  const updates: string[] = [];
  const values: unknown[] = [];
  if (typeof body.is_accepting_queue === "boolean") {
    updates.push("is_accepting_queue = ?");
    values.push(body.is_accepting_queue ? 1 : 0);
  }
  if (typeof body.name === "string" && body.name) {
    updates.push("name = ?");
    values.push(body.name);
  }
  if (typeof body.theme_id === "string") {
    updates.push("theme_id = ?");
    values.push(body.theme_id);
  }
  if (body.working_hours !== undefined) {
    updates.push("working_hours = ?");
    values.push(body.working_hours ? JSON.stringify(body.working_hours) : null);
  }

  if (updates.length === 0) {
    return c.json({ error: "لا توجد حقول للتحديث" }, 400);
  }

  values.push(id);
  await c.env.DB.prepare(`UPDATE shops SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  const updated = await c.env.DB.prepare("SELECT * FROM shops WHERE id = ?")
    .bind(id)
    .first();
  return c.json({ shop: updated });
});

async function ownsShop(
  c: { env: AppEnv["Bindings"] },
  ownerId: string,
  shopId: string,
): Promise<boolean> {
  const shop = await c.env.DB.prepare(
    "SELECT id FROM shops WHERE id = ? AND owner_id = ?",
  )
    .bind(shopId, ownerId)
    .first();
  return !!shop;
}

// قائمة موظفي المحل (المالك فقط).
shopRoutes.get("/:id/staff", requireAuth, async (c) => {
  const auth = c.get("auth");
  const shopId = c.req.param("id");
  if (!(await ownsShop(c, auth.sub, shopId))) {
    return c.json({ error: "غير مصرّح" }, 403);
  }
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, role, is_active, created_at FROM staff WHERE shop_id = ? ORDER BY created_at",
  )
    .bind(shopId)
    .all();
  return c.json({ staff: results ?? [] });
});

// إضافة موظف برمز PIN (المالك فقط).
shopRoutes.post("/:id/staff", requireAuth, async (c) => {
  const auth = c.get("auth");
  const shopId = c.req.param("id");
  if (!(await ownsShop(c, auth.sub, shopId))) {
    return c.json({ error: "غير مصرّح" }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const err = requireFields(body, ["name", "pin"]);
  if (err) return c.json({ error: err }, 400);
  if (!/^\d{4,6}$/.test(String(body.pin))) {
    return c.json({ error: "رمز PIN يجب أن يكون 4 إلى 6 أرقام" }, 400);
  }

  const id = generateId("staff");
  const pinHash = await hashPassword(String(body.pin));
  await c.env.DB.prepare(
    "INSERT INTO staff (id, shop_id, name, pin_code_hash, role) VALUES (?, ?, ?, ?, 'staff')",
  )
    .bind(id, shopId, body.name, pinHash)
    .run();

  return c.json({ staff: { id, name: body.name, role: "staff" } }, 201);
});

// تعطيل موظف (المالك فقط).
shopRoutes.delete("/:id/staff/:staffId", requireAuth, async (c) => {
  const auth = c.get("auth");
  const shopId = c.req.param("id");
  if (!(await ownsShop(c, auth.sub, shopId))) {
    return c.json({ error: "غير مصرّح" }, 403);
  }
  await c.env.DB.prepare(
    "DELETE FROM staff WHERE id = ? AND shop_id = ?",
  )
    .bind(c.req.param("staffId"), shopId)
    .run();
  return c.json({ ok: true });
});
