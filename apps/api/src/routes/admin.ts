import { Hono } from "hono";
import type { AppEnv } from "../lib/http";
import { isValidEmail, requireFields } from "../lib/http";
import { hashPassword, verifyPassword } from "../lib/crypto";
import { generateId } from "../lib/slug";
import { issueToken } from "../lib/jwt";
import { periodEndForPlan } from "../lib/subscription";
import {
  requireAdmin,
  requireAdminRoles,
} from "../middleware/auth";
import type { AdminRole } from "../types";

export const adminRoutes = new Hono<AppEnv>();

async function audit(
  db: D1Database,
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  reason?: string | null,
) {
  await db
    .prepare(
      `INSERT INTO admin_audit_log (id, admin_id, action, target_type, target_id, reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(generateId("audit"), adminId, action, targetType, targetId, reason ?? null)
    .run();
}

// إنشاء أول Super Admin عندما لا يوجد أي أدمن (تطوير/إقلاع أولي).
adminRoutes.post("/auth/bootstrap", async (c) => {
  const count = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM admin_users",
  ).first<{ n: number }>();
  if ((count?.n ?? 0) > 0) {
    return c.json({ error: "يوجد أدمن بالفعل" }, 409);
  }

  const body = await c.req.json().catch(() => ({}));
  const err = requireFields(body, ["email", "password", "name"]);
  if (err) return c.json({ error: err }, 400);
  if (!isValidEmail(body.email)) {
    return c.json({ error: "صيغة البريد غير صحيحة" }, 400);
  }
  if (String(body.password).length < 10) {
    return c.json({ error: "كلمة المرور يجب أن تكون 10 أحرف على الأقل" }, 400);
  }

  const id = generateId("adm");
  const passwordHash = await hashPassword(body.password);
  await c.env.DB.prepare(
    `INSERT INTO admin_users (id, email, password_hash, name, role)
     VALUES (?, ?, ?, ?, 'super_admin')`,
  )
    .bind(id, body.email.toLowerCase(), passwordHash, body.name)
    .run();

  const token = await issueToken(c.env.JWT_SECRET, {
    sub: id,
    email: body.email.toLowerCase(),
    role: "admin",
    adminRole: "super_admin",
  });

  return c.json(
    {
      token,
      admin: {
        id,
        email: body.email.toLowerCase(),
        name: body.name,
        role: "super_admin" as AdminRole,
      },
    },
    201,
  );
});

adminRoutes.post("/auth/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const err = requireFields(body, ["email", "password"]);
  if (err) return c.json({ error: err }, 400);

  const admin = await c.env.DB.prepare(
    `SELECT id, email, name, role, password_hash, is_active
     FROM admin_users WHERE email = ?`,
  )
    .bind(String(body.email).toLowerCase())
    .first<{
      id: string;
      email: string;
      name: string;
      role: AdminRole;
      password_hash: string;
      is_active: number;
    }>();

  if (
    !admin ||
    admin.is_active !== 1 ||
    !(await verifyPassword(body.password, admin.password_hash))
  ) {
    return c.json({ error: "بيانات الدخول غير صحيحة" }, 401);
  }

  const token = await issueToken(c.env.JWT_SECRET, {
    sub: admin.id,
    email: admin.email,
    role: "admin",
    adminRole: admin.role,
  });

  return c.json({
    token,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    },
  });
});

adminRoutes.get("/auth/me", requireAdmin, async (c) => {
  const auth = c.get("admin");
  const admin = await c.env.DB.prepare(
    `SELECT id, email, name, role, is_active FROM admin_users WHERE id = ?`,
  )
    .bind(auth.sub)
    .first();
  if (!admin) return c.json({ error: "غير موجود" }, 404);
  return c.json({ admin });
});

adminRoutes.get(
  "/analytics/overview",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const totals = await c.env.DB.prepare(
      `SELECT
         COUNT(*) AS shops_total,
         SUM(CASE WHEN is_active = 1 AND suspended_at IS NULL THEN 1 ELSE 0 END) AS shops_active,
         SUM(CASE WHEN suspended_at IS NOT NULL THEN 1 ELSE 0 END) AS shops_suspended,
         SUM(CASE WHEN subscription_tier = 'pro' AND subscription_status IN ('active','trial') THEN 1 ELSE 0 END) AS shops_pro,
         SUM(CASE WHEN subscription_tier = 'free' OR subscription_status = 'cancelled' THEN 1 ELSE 0 END) AS shops_free
       FROM shops`,
    ).first();

    const reports = await c.env.DB.prepare(
      `SELECT COUNT(*) AS open_reports FROM shop_reports WHERE status = 'open'`,
    ).first();

    const appointments = await c.env.DB.prepare(
      `SELECT COUNT(*) AS upcoming FROM appointments
       WHERE status = 'confirmed' AND appointment_time >= unixepoch()`,
    ).first();

    return c.json({
      overview: {
        ...totals,
        ...reports,
        ...appointments,
      },
    });
  },
);

adminRoutes.get(
  "/shops",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin", "support_agent"),
  async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    const tier = c.req.query("tier");
    const status = c.req.query("status"); // active | suspended
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);

    const clauses: string[] = ["1=1"];
    const binds: unknown[] = [];

    if (q) {
      clauses.push("(name LIKE ? OR slug LIKE ? OR id = ?)");
      binds.push(`%${q}%`, `%${q}%`, q);
    }
    if (tier === "free" || tier === "pro") {
      clauses.push("subscription_tier = ?");
      binds.push(tier);
    }
    if (status === "suspended") {
      clauses.push("suspended_at IS NOT NULL");
    } else if (status === "active") {
      clauses.push("suspended_at IS NULL AND is_active = 1");
    }

    binds.push(limit);
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, slug, shop_type, subscription_tier, subscription_status,
              subscription_renews_at, is_active, suspended_at, suspend_reason, created_at,
              country_code, city_id, district_id, lat, lng, osm_display_name, location_source
       FROM shops
       WHERE ${clauses.join(" AND ")}
       ORDER BY
         CASE WHEN city_id IS NULL THEN 1 ELSE 0 END,
         city_id,
         CASE WHEN district_id IS NULL THEN 1 ELSE 0 END,
         district_id,
         name
       LIMIT ?`,
    )
      .bind(...binds)
      .all();

    return c.json({ shops: results ?? [] });
  },
);

adminRoutes.get(
  "/shops/:id",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin", "support_agent"),
  async (c) => {
    const shop = await c.env.DB.prepare("SELECT * FROM shops WHERE id = ?")
      .bind(c.req.param("id"))
      .first();
    if (!shop) return c.json({ error: "المحل غير موجود" }, 404);

    const staff = await c.env.DB.prepare(
      `SELECT id, name, role, is_active, created_at FROM staff WHERE shop_id = ?`,
    )
      .bind(c.req.param("id"))
      .all();

    const sub = await c.env.DB.prepare(
      `SELECT * FROM subscriptions WHERE shop_id = ? ORDER BY created_at DESC LIMIT 5`,
    )
      .bind(c.req.param("id"))
      .all();

    return c.json({
      shop,
      staff: staff.results ?? [],
      subscriptions: sub.results ?? [],
    });
  },
);

adminRoutes.post(
  "/shops/:id/suspend",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const admin = c.get("admin");
    const body = await c.req.json().catch(() => ({}));
    const err = requireFields(body, ["reason"]);
    if (err) return c.json({ error: err }, 400);

    const shop = await c.env.DB.prepare("SELECT id FROM shops WHERE id = ?")
      .bind(c.req.param("id"))
      .first();
    if (!shop) return c.json({ error: "المحل غير موجود" }, 404);

    const now = Math.floor(Date.now() / 1000);
    await c.env.DB.prepare(
      `UPDATE shops SET is_active = 0, suspended_at = ?, suspend_reason = ?, is_accepting_queue = 0
       WHERE id = ?`,
    )
      .bind(now, body.reason, c.req.param("id"))
      .run();

    await audit(
      c.env.DB,
      admin.sub,
      "shop.suspend",
      "shop",
      c.req.param("id"),
      body.reason,
    );

    return c.json({ ok: true });
  },
);

adminRoutes.post(
  "/shops/:id/reactivate",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const admin = c.get("admin");
    const shop = await c.env.DB.prepare("SELECT id FROM shops WHERE id = ?")
      .bind(c.req.param("id"))
      .first();
    if (!shop) return c.json({ error: "المحل غير موجود" }, 404);

    await c.env.DB.prepare(
      `UPDATE shops SET is_active = 1, suspended_at = NULL, suspend_reason = NULL WHERE id = ?`,
    )
      .bind(c.req.param("id"))
      .run();

    await audit(
      c.env.DB,
      admin.sub,
      "shop.reactivate",
      "shop",
      c.req.param("id"),
    );

    return c.json({ ok: true });
  },
);

// ترقية/تعديل باقة يدويًا (دعم / مالية مبسّطة قبل بوابة الدفع).
adminRoutes.post(
  "/shops/:id/set-tier",
  requireAdmin,
  requireAdminRoles("super_admin"),
  async (c) => {
    const admin = c.get("admin");
    const body = await c.req.json().catch(() => ({}));
    const tier = body.tier;
    if (tier !== "free" && tier !== "pro") {
      return c.json({ error: "tier يجب أن يكون free أو pro" }, 400);
    }

    const shopId = c.req.param("id");
    const shop = await c.env.DB.prepare("SELECT id FROM shops WHERE id = ?")
      .bind(shopId)
      .first();
    if (!shop) return c.json({ error: "المحل غير موجود" }, 404);

    if (tier === "free") {
      await c.env.DB.prepare(
        `UPDATE shops SET subscription_tier = 'free', subscription_status = 'active',
           subscription_renews_at = NULL, hide_powered_by = 0 WHERE id = ?`,
      )
        .bind(shopId)
        .run();
      await c.env.DB.prepare(
        `UPDATE subscriptions SET status = 'cancelled', cancel_at_period_end = 1
         WHERE shop_id = ? AND status IN ('active','trial')`,
      )
        .bind(shopId)
        .run();
    } else {
      const plan = body.plan === "pro_yearly" ? "pro_yearly" : "pro_monthly";
      const periodEnd = periodEndForPlan(plan);
      const subId = generateId("sub");
      await c.env.DB.prepare(
        `INSERT INTO subscriptions
          (id, shop_id, plan, status, provider, current_period_end, cancel_at_period_end)
         VALUES (?, ?, ?, 'active', 'manual', ?, 0)`,
      )
        .bind(subId, shopId, plan, periodEnd)
        .run();
      await c.env.DB.prepare(
        `UPDATE shops SET subscription_tier = 'pro', subscription_status = 'active',
           subscription_renews_at = ? WHERE id = ?`,
      )
        .bind(periodEnd, shopId)
        .run();
    }

    await audit(
      c.env.DB,
      admin.sub,
      "shop.set_tier",
      "shop",
      shopId,
      body.reason ?? `set to ${tier}`,
    );

    return c.json({ ok: true });
  },
);

adminRoutes.get(
  "/reports",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const status = c.req.query("status") ?? "open";
    const { results } = await c.env.DB.prepare(
      `SELECT r.*, s.name AS shop_name, s.slug AS shop_slug
       FROM shop_reports r
       JOIN shops s ON s.id = r.shop_id
       WHERE r.status = ?
       ORDER BY r.created_at DESC
       LIMIT 100`,
    )
      .bind(status)
      .all();
    return c.json({ reports: results ?? [] });
  },
);

adminRoutes.post(
  "/reports/:id/resolve",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const admin = c.get("admin");
    const body = await c.req.json().catch(() => ({}));
    const status = body.status === "dismissed" ? "dismissed" : "resolved";
    const err = requireFields(body, ["reason"]);
    if (err) return c.json({ error: err }, 400);

    const report = await c.env.DB.prepare(
      "SELECT id FROM shop_reports WHERE id = ?",
    )
      .bind(c.req.param("id"))
      .first();
    if (!report) return c.json({ error: "البلاغ غير موجود" }, 404);

    await c.env.DB.prepare(
      `UPDATE shop_reports SET status = ? WHERE id = ?`,
    )
      .bind(status, c.req.param("id"))
      .run();

    await audit(
      c.env.DB,
      admin.sub,
      `report.${status}`,
      "report",
      c.req.param("id"),
      body.reason,
    );

    return c.json({ ok: true });
  },
);

adminRoutes.get(
  "/audit-log",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT a.*, u.email AS admin_email
       FROM admin_audit_log a
       LEFT JOIN admin_users u ON u.id = a.admin_id
       ORDER BY a.created_at DESC
       LIMIT 100`,
    ).all();
    return c.json({ entries: results ?? [] });
  },
);

adminRoutes.get(
  "/locations/cities",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const country = c.req.query("country") ?? "SA";
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM cities WHERE country_code = ? ORDER BY name_ar`,
    )
      .bind(country)
      .all();
    return c.json({ cities: results ?? [] });
  },
);

adminRoutes.post(
  "/locations/cities",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const admin = c.get("admin");
    const body = await c.req.json().catch(() => ({}));
    const err = requireFields(body, ["id", "country_code", "name_ar", "name_en"]);
    if (err) return c.json({ error: err }, 400);

    await c.env.DB.prepare(
      `INSERT INTO cities (id, country_code, name_ar, name_en) VALUES (?, ?, ?, ?)`,
    )
      .bind(body.id, body.country_code, body.name_ar, body.name_en)
      .run();

    await audit(c.env.DB, admin.sub, "location.city_create", "city", body.id);
    return c.json({ ok: true }, 201);
  },
);

adminRoutes.post(
  "/locations/districts",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const admin = c.get("admin");
    const body = await c.req.json().catch(() => ({}));
    const err = requireFields(body, ["id", "city_id", "name_ar", "name_en"]);
    if (err) return c.json({ error: err }, 400);

    await c.env.DB.prepare(
      `INSERT INTO districts (id, city_id, name_ar, name_en) VALUES (?, ?, ?, ?)`,
    )
      .bind(body.id, body.city_id, body.name_ar, body.name_en)
      .run();

    await audit(
      c.env.DB,
      admin.sub,
      "location.district_create",
      "district",
      body.id,
    );
    return c.json({ ok: true }, 201);
  },
);

adminRoutes.get(
  "/reserved-slugs",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT slug, reason, created_at FROM reserved_slugs ORDER BY slug`,
    ).all();
    return c.json({ slugs: results ?? [] });
  },
);

adminRoutes.post(
  "/reserved-slugs",
  requireAdmin,
  requireAdminRoles("super_admin"),
  async (c) => {
    const admin = c.get("admin");
    const body = await c.req.json().catch(() => ({}));
    const err = requireFields(body, ["slug"]);
    if (err) return c.json({ error: err }, 400);
    const slug = String(body.slug).toLowerCase().trim();
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO reserved_slugs (slug, reason) VALUES (?, ?)`,
    )
      .bind(slug, body.reason ?? null)
      .run();
    await audit(c.env.DB, admin.sub, "slug.reserve", "slug", slug, body.reason);
    return c.json({ ok: true }, 201);
  },
);

adminRoutes.delete(
  "/reserved-slugs/:slug",
  requireAdmin,
  requireAdminRoles("super_admin"),
  async (c) => {
    const admin = c.get("admin");
    const slug = c.req.param("slug");
    await c.env.DB.prepare(`DELETE FROM reserved_slugs WHERE slug = ?`)
      .bind(slug)
      .run();
    await audit(c.env.DB, admin.sub, "slug.unreserve", "slug", slug);
    return c.json({ ok: true });
  },
);
