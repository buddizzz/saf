import { Hono } from "hono";
import type { AppEnv } from "../lib/http";
import { isValidEmail, requireFields } from "../lib/http";
import { hashPassword, needsRehash, verifyPassword } from "../lib/crypto";
import { generateId } from "../lib/slug";
import { issueToken } from "../lib/jwt";
import { periodEndForPlan } from "../lib/subscription";
import { creditBalance, ensureShopBalance } from "../lib/billing";
import { dispatchCampaign } from "../lib/campaigns";
import { OFFLINE_THRESHOLD_DAYS, shopPresence } from "../lib/activity";
import { runLifecycleCron } from "../cron/lifecycle";
import { runCampaignCron } from "../cron/send-campaigns";
import {
  generateTotpSecret,
  totpOtpauthUrl,
  verifyTotp,
} from "../lib/totp";
import { clientIp, rateLimit } from "../lib/rate-limit";
import {
  requireAdmin,
  requireAdminRoles,
} from "../middleware/auth";
import type { AdminRole } from "../types";

export const adminRoutes = new Hono<AppEnv>();

/** 2FA مفعّل افتراضيًا؛ عطّله بـ ADMIN_2FA_REQUIRED=false للاختبار. */
function isAdmin2faRequired(env: { ADMIN_2FA_REQUIRED?: string }): boolean {
  const raw = env.ADMIN_2FA_REQUIRED?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") return false;
  if (raw === "true" || raw === "1" || raw === "on") return true;
  return true;
}

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
  // يُنشأ بدون 2FA ثم يُطلب التفعيل فور أول دخول
  await c.env.DB.prepare(
    `INSERT INTO admin_users (id, email, password_hash, name, role, totp_enabled)
     VALUES (?, ?, ?, ?, 'super_admin', 0)`,
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
        totp_enabled: false,
      },
      must_enroll_2fa: isAdmin2faRequired(c.env),
    },
    201,
  );
});

adminRoutes.post("/auth/login", async (c) => {
  const ip = clientIp(c);
  const rl = rateLimit(`admin-login:${ip}`, 5, 60_000, { lockMs: 60_000 });
  if (!rl.ok) {
    return c.json(
      { error: "محاولات كثيرة، حاول لاحقًا", retry_after: rl.retryAfterSec },
      429,
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const err = requireFields(body, ["email", "password"]);
  if (err) return c.json({ error: err }, 400);

  const admin = await c.env.DB.prepare(
    `SELECT id, email, name, role, password_hash, is_active,
            totp_secret, totp_enabled, locked_until, failed_login_count
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
      totp_secret: string | null;
      totp_enabled: number;
      locked_until: number | null;
      failed_login_count: number;
    }>();

  const now = Math.floor(Date.now() / 1000);
  if (admin?.locked_until && admin.locked_until > now) {
    return c.json({ error: "الحساب مقفل مؤقتًا", retry_after: admin.locked_until - now }, 429);
  }

  if (
    !admin ||
    admin.is_active !== 1 ||
    !(await verifyPassword(body.password, admin.password_hash))
  ) {
    if (admin) {
      const fails = (admin.failed_login_count ?? 0) + 1;
      const lockedUntil = fails >= 5 ? now + 15 * 60 : null;
      await c.env.DB.prepare(
        `UPDATE admin_users SET failed_login_count = ?, locked_until = ? WHERE id = ?`,
      )
        .bind(fails, lockedUntil, admin.id)
        .run();
      await audit(c.env.DB, admin.id, "auth.login_failed", "admin", admin.id, ip);
    }
    return c.json({ error: "بيانات الدخول غير صحيحة" }, 401);
  }

  await c.env.DB.prepare(
    `UPDATE admin_users SET failed_login_count = 0, locked_until = NULL WHERE id = ?`,
  )
    .bind(admin.id)
    .run();

  if (needsRehash(admin.password_hash)) {
    const next = await hashPassword(body.password);
    await c.env.DB.prepare(`UPDATE admin_users SET password_hash = ? WHERE id = ?`)
      .bind(next, admin.id)
      .run();
  }

  // إن كان 2FA مفعّلًا ومطلوبًا: لا تُصدر JWT كامل إلا بعد الرمز
  if (
    isAdmin2faRequired(c.env) &&
    admin.totp_enabled === 1 &&
    admin.totp_secret
  ) {
    const pending = await issueToken(
      c.env.JWT_SECRET,
      {
        sub: admin.id,
        email: admin.email,
        role: "admin",
        adminRole: admin.role,
        pending2fa: true,
      },
      300,
    );
    return c.json({
      requires_2fa: true,
      pending_token: pending,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    });
  }

  const token = await issueToken(c.env.JWT_SECRET, {
    sub: admin.id,
    email: admin.email,
    role: "admin",
    adminRole: admin.role,
  });

  return c.json({
    token,
    requires_2fa: false,
    must_enroll_2fa:
      isAdmin2faRequired(c.env) && admin.totp_enabled !== 1,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      totp_enabled: admin.totp_enabled === 1,
    },
  });
});

adminRoutes.post("/auth/2fa/verify", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const err = requireFields(body, ["pending_token", "code"]);
  if (err) return c.json({ error: err }, 400);

  const { readToken } = await import("../lib/jwt");
  const payload = await readToken(c.env.JWT_SECRET, body.pending_token);
  if (!payload || payload.role !== "admin" || !payload.pending2fa) {
    return c.json({ error: "رمز مؤقت غير صالح" }, 401);
  }

  const admin = await c.env.DB.prepare(
    `SELECT id, email, name, role, totp_secret, totp_enabled, is_active
     FROM admin_users WHERE id = ?`,
  )
    .bind(payload.sub)
    .first<{
      id: string;
      email: string;
      name: string;
      role: AdminRole;
      totp_secret: string | null;
      totp_enabled: number;
      is_active: number;
    }>();

  if (!admin || admin.is_active !== 1 || !admin.totp_secret) {
    return c.json({ error: "غير مصرّح" }, 401);
  }
  if (!(await verifyTotp(admin.totp_secret, String(body.code)))) {
    await audit(c.env.DB, admin.id, "auth.2fa_failed", "admin", admin.id);
    return c.json({ error: "رمز التحقق غير صحيح" }, 401);
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
      totp_enabled: true,
    },
  });
});

adminRoutes.post("/auth/2fa/setup", requireAdmin, async (c) => {
  if (!isAdmin2faRequired(c.env)) {
    return c.json({ error: "2FA معطّل مؤقتًا (ADMIN_2FA_REQUIRED=false)" }, 400);
  }
  const auth = c.get("admin");
  const secret = generateTotpSecret();
  await c.env.DB.prepare(
    `UPDATE admin_users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?`,
  )
    .bind(secret, auth.sub)
    .run();

  return c.json({
    secret,
    otpauth_url: totpOtpauthUrl({ secret, email: auth.email }),
  });
});

adminRoutes.post("/auth/2fa/enable", requireAdmin, async (c) => {
  const auth = c.get("admin");
  const body = await c.req.json().catch(() => ({}));
  const err = requireFields(body, ["code"]);
  if (err) return c.json({ error: err }, 400);

  const admin = await c.env.DB.prepare(
    `SELECT totp_secret FROM admin_users WHERE id = ?`,
  )
    .bind(auth.sub)
    .first<{ totp_secret: string | null }>();
  if (!admin?.totp_secret) {
    return c.json({ error: "ابدأ بإعداد 2FA أولًا" }, 400);
  }
  if (!(await verifyTotp(admin.totp_secret, String(body.code)))) {
    return c.json({ error: "رمز التحقق غير صحيح" }, 401);
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `UPDATE admin_users SET totp_enabled = 1, totp_enrolled_at = ? WHERE id = ?`,
  )
    .bind(now, auth.sub)
    .run();
  await audit(c.env.DB, auth.sub, "auth.2fa_enabled", "admin", auth.sub);

  return c.json({ ok: true, totp_enabled: true });
});

adminRoutes.get("/auth/me", requireAdmin, async (c) => {
  const auth = c.get("admin");
  if (auth.pending2fa) {
    return c.json({ error: "أكمل التحقق بخطوتين" }, 401);
  }
  const admin = await c.env.DB.prepare(
    `SELECT id, email, name, role, is_active, totp_enabled FROM admin_users WHERE id = ?`,
  )
    .bind(auth.sub)
    .first<{
      id: string;
      email: string;
      name: string;
      role: AdminRole;
      is_active: number;
      totp_enabled: number;
    }>();
  if (!admin) return c.json({ error: "غير موجود" }, 404);
  const require2fa = isAdmin2faRequired(c.env);
  return c.json({
    admin,
    must_enroll_2fa: require2fa && admin.totp_enabled !== 1,
    admin_2fa_required: require2fa,
  });
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

    const campaigns = await c.env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) AS campaigns_pending,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS campaigns_completed,
         SUM(CASE WHEN status = 'sending' OR status = 'scheduled' THEN 1 ELSE 0 END) AS campaigns_active
       FROM campaigns`,
    ).first();

    const messages = await c.env.DB.prepare(
      `SELECT COUNT(*) AS messages_sent FROM campaign_messages WHERE status = 'sent'`,
    ).first();

    return c.json({
      overview: {
        ...totals,
        ...reports,
        ...appointments,
        ...campaigns,
        ...messages,
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
      clauses.push(
        "(s.name LIKE ? OR s.slug LIKE ? OR s.id = ? OR o.email LIKE ? OR o.name LIKE ?)",
      );
      binds.push(`%${q}%`, `%${q}%`, q, `%${q}%`, `%${q}%`);
    }
    if (tier === "free" || tier === "pro") {
      clauses.push("s.subscription_tier = ?");
      binds.push(tier);
    }
    if (status === "suspended") {
      clauses.push("s.suspended_at IS NOT NULL");
    } else if (status === "active") {
      clauses.push("s.suspended_at IS NULL AND s.is_active = 1");
    }

    binds.push(limit);
    const { results } = await c.env.DB.prepare(
      `SELECT s.id, s.name, s.slug, s.shop_type, s.subscription_tier, s.subscription_status,
              s.subscription_renews_at, s.is_active, s.suspended_at, s.suspend_reason, s.created_at,
              s.country_code, s.city_id, s.district_id, s.lat, s.lng, s.osm_display_name, s.location_source,
              COALESCE(b.balance, 0) AS balance,
              o.name AS owner_name, o.email AS owner_email
       FROM shops s
       LEFT JOIN shop_balance b ON b.shop_id = s.id
       LEFT JOIN owners o ON o.id = s.owner_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY
         CASE WHEN s.city_id IS NULL THEN 1 ELSE 0 END,
         s.city_id,
         CASE WHEN s.district_id IS NULL THEN 1 ELSE 0 END,
         s.district_id,
         s.name
       LIMIT ?`,
    )
      .bind(...binds)
      .all();

    return c.json({ shops: results ?? [] });
  },
);

// خريطة المحلات: متصل (نشاط خلال أسبوع) / غير متصل / موقوف — مع الإحداثيات.
adminRoutes.get(
  "/shops/map",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin", "support_agent"),
  async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, slug, shop_type, subscription_tier, subscription_status,
              is_active, is_accepting_queue, suspended_at, last_activity_at,
              lat, lng, city_id, district_id, osm_display_name
       FROM shops
       LIMIT 1000`,
    ).all<{
      id: string;
      name: string;
      slug: string;
      shop_type: string;
      subscription_tier: string;
      subscription_status: string;
      is_active: number;
      is_accepting_queue: number;
      suspended_at: number | null;
      last_activity_at: number | null;
      lat: number | null;
      lng: number | null;
      city_id: string | null;
      district_id: string | null;
      osm_display_name: string | null;
    }>();

    const shops = (results ?? []).map((s) => ({
      ...s,
      presence: shopPresence(s),
    }));

    const counts = {
      total: shops.length,
      online: shops.filter((s) => s.presence === "online").length,
      offline: shops.filter((s) => s.presence === "offline").length,
      suspended: shops.filter((s) => s.presence === "suspended").length,
      unlocated: shops.filter((s) => s.lat == null || s.lng == null).length,
    };

    return c.json({
      shops,
      counts,
      offline_threshold_days: OFFLINE_THRESHOLD_DAYS,
    });
  },
);

// تنبيهات المنصة (غياب أسبوع، تجديد، انتهاء اشتراك…) المرسلة لأصحاب المحلات.
adminRoutes.get(
  "/notifications",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin", "support_agent"),
  async (c) => {
    const type = c.req.query("type");
    const clauses = ["1=1"];
    const binds: unknown[] = [];
    if (type) {
      clauses.push("n.type = ?");
      binds.push(type);
    }
    const { results } = await c.env.DB.prepare(
      `SELECT n.id, n.shop_id, n.type, n.channel, n.message, n.status, n.error,
              n.created_at, s.name AS shop_name, s.slug AS shop_slug
       FROM shop_notifications n
       JOIN shops s ON s.id = n.shop_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY n.created_at DESC
       LIMIT 100`,
    )
      .bind(...binds)
      .all();
    return c.json({ notifications: results ?? [] });
  },
);

// تشغيل يدوي لدورات الأتمتة (دورة الحياة + الحملات) — للتشغيل والدعم.
adminRoutes.post(
  "/cron/run",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const admin = c.get("admin");
    const lifecycle = await runLifecycleCron(c.env);
    const campaigns = await runCampaignCron(c.env);
    await audit(c.env.DB, admin.sub, "cron.manual_run", "platform", "cron");
    return c.json({ ok: true, lifecycle, campaigns });
  },
);

adminRoutes.get(
  "/shops/:id",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin", "support_agent"),
  async (c) => {
    const shopId = c.req.param("id");
    const shop = await c.env.DB.prepare("SELECT * FROM shops WHERE id = ?")
      .bind(shopId)
      .first<{
        id: string;
        owner_id: string;
        city_id: string | null;
        district_id: string | null;
        [key: string]: unknown;
      }>();
    if (!shop) return c.json({ error: "المحل غير موجود" }, 404);

    const owner = await c.env.DB.prepare(
      `SELECT id, name, email, created_at FROM owners WHERE id = ?`,
    )
      .bind(shop.owner_id)
      .first();

    const staff = await c.env.DB.prepare(
      `SELECT id, name, role, is_active, created_at FROM staff WHERE shop_id = ?`,
    )
      .bind(shopId)
      .all();

    const sub = await c.env.DB.prepare(
      `SELECT * FROM subscriptions WHERE shop_id = ? ORDER BY created_at DESC LIMIT 5`,
    )
      .bind(shopId)
      .all();

    const balance = await ensureShopBalance(c.env.DB, shopId);

    const visits = await c.env.DB.prepare(
      `SELECT COUNT(*) AS visit_count FROM customer_shop_visits WHERE shop_id = ?`,
    )
      .bind(shopId)
      .first<{ visit_count: number }>();

    const queueToday = await c.env.DB.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) AS waiting,
         SUM(CASE WHEN status = 'serving' THEN 1 ELSE 0 END) AS serving,
         SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
       FROM queue_entries
       WHERE shop_id = ? AND queue_date = date('now')`,
    )
      .bind(shopId)
      .first();

    const appointments = await c.env.DB.prepare(
      `SELECT COUNT(*) AS upcoming FROM appointments
       WHERE shop_id = ? AND status = 'confirmed' AND appointment_time >= unixepoch()`,
    )
      .bind(shopId)
      .first<{ upcoming: number }>();

    const openReports = await c.env.DB.prepare(
      `SELECT COUNT(*) AS open_reports FROM shop_reports
       WHERE shop_id = ? AND status = 'open'`,
    )
      .bind(shopId)
      .first<{ open_reports: number }>();

    const campaigns = await c.env.DB.prepare(
      `SELECT id, name, status, audience_type, audience_count, cost, created_at, sent_at
       FROM campaigns WHERE shop_id = ? ORDER BY created_at DESC LIMIT 10`,
    )
      .bind(shopId)
      .all();

    const payments = await c.env.DB.prepare(
      `SELECT id, amount, bonus_amount, provider, status, note, created_at
       FROM payments WHERE shop_id = ? ORDER BY created_at DESC LIMIT 10`,
    )
      .bind(shopId)
      .all();

    let cityName: string | null = null;
    let districtName: string | null = null;
    if (shop.city_id) {
      const city = await c.env.DB.prepare(
        `SELECT name_ar FROM cities WHERE id = ?`,
      )
        .bind(shop.city_id)
        .first<{ name_ar: string }>();
      cityName = city?.name_ar ?? null;
    }
    if (shop.district_id) {
      const district = await c.env.DB.prepare(
        `SELECT name_ar FROM districts WHERE id = ?`,
      )
        .bind(shop.district_id)
        .first<{ name_ar: string }>();
      districtName = district?.name_ar ?? null;
    }

    return c.json({
      shop: {
        ...shop,
        city_name: cityName,
        district_name: districtName,
      },
      owner,
      staff: staff.results ?? [],
      subscriptions: sub.results ?? [],
      balance,
      stats: {
        visit_count: visits?.visit_count ?? 0,
        queue_today: queueToday ?? { total: 0, waiting: 0, serving: 0, done: 0 },
        upcoming_appointments: appointments?.upcoming ?? 0,
        open_reports: openReports?.open_reports ?? 0,
      },
      recent_campaigns: campaigns.results ?? [],
      recent_payments: payments.results ?? [],
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
    const action = (c.req.query("action") ?? "").trim();
    const q = (c.req.query("q") ?? "").trim();
    const limit = Math.min(Number(c.req.query("limit") ?? 100), 200);

    const clauses: string[] = ["1=1"];
    const binds: unknown[] = [];
    if (action) {
      clauses.push("a.action LIKE ?");
      binds.push(`${action}%`);
    }
    if (q) {
      clauses.push(
        "(a.target_id LIKE ? OR a.reason LIKE ? OR u.email LIKE ? OR a.action LIKE ?)",
      );
      binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    binds.push(limit);

    const { results } = await c.env.DB.prepare(
      `SELECT a.*, u.email AS admin_email
       FROM admin_audit_log a
       LEFT JOIN admin_users u ON u.id = a.admin_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY a.created_at DESC
       LIMIT ?`,
    )
      .bind(...binds)
      .all();
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

adminRoutes.get(
  "/campaigns/pending",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT c.*, s.name AS shop_name, s.slug AS shop_slug
       FROM campaigns c
       JOIN shops s ON s.id = c.shop_id
       WHERE c.status = 'pending_review'
       ORDER BY c.created_at ASC
       LIMIT 100`,
    ).all();
    return c.json({ campaigns: results ?? [] });
  },
);

adminRoutes.post(
  "/campaigns/:id/approve",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const admin = c.get("admin");
    const campaign = await c.env.DB.prepare(
      `SELECT id, status, scheduled_at FROM campaigns WHERE id = ?`,
    )
      .bind(c.req.param("id"))
      .first<{ id: string; status: string; scheduled_at: number | null }>();
    if (!campaign) return c.json({ error: "الحملة غير موجودة" }, 404);
    if (campaign.status !== "pending_review") {
      return c.json({ error: "الحملة ليست بانتظار المراجعة" }, 400);
    }

    const now = Math.floor(Date.now() / 1000);
    await c.env.DB.prepare(
      `UPDATE campaigns
       SET status = 'scheduled', moderated_by = ?, moderated_at = ?
       WHERE id = ?`,
    )
      .bind(admin.sub, now, campaign.id)
      .run();

    await audit(
      c.env.DB,
      admin.sub,
      "campaign.approve",
      "campaign",
      campaign.id,
    );

    // إرسال فوري إن لم تكن مجدولة للمستقبل
    if (!campaign.scheduled_at || campaign.scheduled_at <= now) {
      const result = await dispatchCampaign(c.env, campaign.id);
      return c.json({ ok: true, dispatched: true, ...result });
    }
    return c.json({ ok: true, dispatched: false, scheduled_at: campaign.scheduled_at });
  },
);

adminRoutes.post(
  "/campaigns/:id/reject",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const admin = c.get("admin");
    const body = await c.req.json().catch(() => ({}));
    const err = requireFields(body, ["reason"]);
    if (err) return c.json({ error: err }, 400);

    const campaign = await c.env.DB.prepare(
      `SELECT id, status, shop_id, cost FROM campaigns WHERE id = ?`,
    )
      .bind(c.req.param("id"))
      .first<{
        id: string;
        status: string;
        shop_id: string;
        cost: number;
      }>();
    if (!campaign) return c.json({ error: "الحملة غير موجودة" }, 404);
    if (campaign.status !== "pending_review") {
      return c.json({ error: "الحملة ليست بانتظار المراجعة" }, 400);
    }

    const now = Math.floor(Date.now() / 1000);
    await c.env.DB.prepare(
      `UPDATE campaigns
       SET status = 'rejected', rejection_reason = ?, moderated_by = ?, moderated_at = ?
       WHERE id = ?`,
    )
      .bind(body.reason, admin.sub, now, campaign.id)
      .run();

    // استرجاع الرصيد المخصوم
    if (campaign.cost > 0) {
      await creditBalance(c.env.DB, campaign.shop_id, campaign.cost, {
        provider: "manual",
        note: `refund rejected campaign ${campaign.id}`,
        applyVolumeBonus: false,
      });
    }

    await audit(
      c.env.DB,
      admin.sub,
      "campaign.reject",
      "campaign",
      campaign.id,
      body.reason,
    );

    return c.json({ ok: true });
  },
);

adminRoutes.post(
  "/shops/:id/balance-adjust",
  requireAdmin,
  requireAdminRoles("super_admin"),
  async (c) => {
    const admin = c.get("admin");
    const body = await c.req.json().catch(() => ({}));
    const err = requireFields(body, ["amount", "reason"]);
    if (err) return c.json({ error: err }, 400);

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      return c.json({ error: "المبلغ غير صالح" }, 400);
    }

    const shop = await c.env.DB.prepare("SELECT id FROM shops WHERE id = ?")
      .bind(c.req.param("id"))
      .first();
    if (!shop) return c.json({ error: "المحل غير موجود" }, 404);

    await ensureShopBalance(c.env.DB, c.req.param("id"));

    if (amount > 0) {
      const result = await creditBalance(c.env.DB, c.req.param("id"), amount, {
        provider: "manual",
        note: body.reason,
        applyVolumeBonus: body.apply_bonus === true,
      });
      await audit(
        c.env.DB,
        admin.sub,
        "shop.balance_credit",
        "shop",
        c.req.param("id"),
        `${amount}: ${body.reason}`,
      );
      return c.json({ ok: true, ...result });
    }

    // خصم يدوي
    const debitAmount = Math.abs(amount);
    const bal = await ensureShopBalance(c.env.DB, c.req.param("id"));
    if (bal.balance < debitAmount) {
      return c.json({ error: "الرصيد أقل من مبلغ الخصم", balance: bal.balance }, 400);
    }
    await c.env.DB.prepare(
      `UPDATE shop_balance SET balance = balance - ?, updated_at = unixepoch()
       WHERE shop_id = ?`,
    )
      .bind(debitAmount, c.req.param("id"))
      .run();
    await c.env.DB.prepare(
      `INSERT INTO payments (id, shop_id, amount, bonus_amount, provider, status, note)
       VALUES (?, ?, ?, 0, 'manual', 'completed', ?)`,
    )
      .bind(
        generateId("pay"),
        c.req.param("id"),
        -debitAmount,
        body.reason,
      )
      .run();

    await audit(
      c.env.DB,
      admin.sub,
      "shop.balance_debit",
      "shop",
      c.req.param("id"),
      `${-debitAmount}: ${body.reason}`,
    );

    const next = await ensureShopBalance(c.env.DB, c.req.param("id"));
    return c.json({ ok: true, balance: next.balance });
  },
);

adminRoutes.get(
  "/shops/:id/balance",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin", "support_agent"),
  async (c) => {
    const shop = await c.env.DB.prepare("SELECT id FROM shops WHERE id = ?")
      .bind(c.req.param("id"))
      .first();
    if (!shop) return c.json({ error: "المحل غير موجود" }, 404);
    const bal = await ensureShopBalance(c.env.DB, c.req.param("id"));
    return c.json({ balance: bal });
  },
);

// —— حملات: قائمة كاملة + تفاصيل إحصاء الإرسال ——
adminRoutes.get(
  "/campaigns",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const status = (c.req.query("status") ?? "").trim();
    const q = (c.req.query("q") ?? "").trim();
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);

    const clauses: string[] = ["1=1"];
    const binds: unknown[] = [];
    if (status) {
      clauses.push("c.status = ?");
      binds.push(status);
    }
    if (q) {
      clauses.push("(c.name LIKE ? OR s.name LIKE ? OR s.slug LIKE ? OR c.id = ?)");
      binds.push(`%${q}%`, `%${q}%`, `%${q}%`, q);
    }
    binds.push(limit);

    const { results } = await c.env.DB.prepare(
      `SELECT c.*, s.name AS shop_name, s.slug AS shop_slug,
              (SELECT COUNT(*) FROM campaign_messages m WHERE m.campaign_id = c.id AND m.status = 'sent') AS messages_sent,
              (SELECT COUNT(*) FROM campaign_messages m WHERE m.campaign_id = c.id AND m.status = 'failed') AS messages_failed,
              (SELECT COUNT(*) FROM campaign_messages m WHERE m.campaign_id = c.id) AS messages_total
       FROM campaigns c
       JOIN shops s ON s.id = c.shop_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY c.created_at DESC
       LIMIT ?`,
    )
      .bind(...binds)
      .all();

    return c.json({ campaigns: results ?? [] });
  },
);

adminRoutes.get(
  "/campaigns/:id",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const campaign = await c.env.DB.prepare(
      `SELECT c.*, s.name AS shop_name, s.slug AS shop_slug
       FROM campaigns c
       JOIN shops s ON s.id = c.shop_id
       WHERE c.id = ?`,
    )
      .bind(c.req.param("id"))
      .first();
    if (!campaign) return c.json({ error: "الحملة غير موجودة" }, 404);

    const breakdown = await c.env.DB.prepare(
      `SELECT status, COUNT(*) AS count
       FROM campaign_messages WHERE campaign_id = ?
       GROUP BY status`,
    )
      .bind(c.req.param("id"))
      .all();

    return c.json({
      campaign,
      message_breakdown: breakdown.results ?? [],
    });
  },
);

// —— مالية: مدفوعات + أرصدة ——
adminRoutes.get(
  "/payments",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const clauses: string[] = ["1=1"];
    const binds: unknown[] = [];
    if (q) {
      clauses.push("(s.name LIKE ? OR s.slug LIKE ? OR p.note LIKE ? OR p.id = ?)");
      binds.push(`%${q}%`, `%${q}%`, `%${q}%`, q);
    }
    binds.push(limit);

    const { results } = await c.env.DB.prepare(
      `SELECT p.*, s.name AS shop_name, s.slug AS shop_slug
       FROM payments p
       JOIN shops s ON s.id = p.shop_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY p.created_at DESC
       LIMIT ?`,
    )
      .bind(...binds)
      .all();

    return c.json({ payments: results ?? [] });
  },
);

adminRoutes.get(
  "/finance/overview",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const balances = await c.env.DB.prepare(
      `SELECT
         COUNT(*) AS shops_with_balance,
         COALESCE(SUM(balance), 0) AS total_balance
       FROM shop_balance`,
    ).first();

    const payments = await c.env.DB.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN amount > 0 AND status = 'completed' THEN amount ELSE 0 END), 0) AS credited,
         COALESCE(SUM(CASE WHEN amount < 0 AND status = 'completed' THEN ABS(amount) ELSE 0 END), 0) AS debited,
         COALESCE(SUM(CASE WHEN status = 'completed' THEN bonus_amount ELSE 0 END), 0) AS bonuses,
         COUNT(*) AS payment_count
       FROM payments`,
    ).first();

    const spend = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(cost), 0) AS campaign_spend
       FROM campaigns
       WHERE status IN ('completed', 'sending', 'scheduled')`,
    ).first();

    return c.json({
      finance: {
        ...balances,
        ...payments,
        ...spend,
      },
    });
  },
);

// —— كلمات محظورة ——
adminRoutes.get(
  "/banned-words",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT word, created_at FROM campaign_banned_words ORDER BY word`,
    ).all();
    return c.json({ words: results ?? [] });
  },
);

adminRoutes.post(
  "/banned-words",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const admin = c.get("admin");
    const body = await c.req.json().catch(() => ({}));
    const err = requireFields(body, ["word"]);
    if (err) return c.json({ error: err }, 400);
    const word = String(body.word).trim().toLowerCase();
    if (!word) return c.json({ error: "الكلمة فارغة" }, 400);

    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO campaign_banned_words (word) VALUES (?)`,
    )
      .bind(word)
      .run();

    await audit(c.env.DB, admin.sub, "banned_word.add", "banned_word", word);
    return c.json({ ok: true }, 201);
  },
);

adminRoutes.delete(
  "/banned-words/:word",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const admin = c.get("admin");
    const word = decodeURIComponent(c.req.param("word"));
    await c.env.DB.prepare(`DELETE FROM campaign_banned_words WHERE word = ?`)
      .bind(word)
      .run();
    await audit(c.env.DB, admin.sub, "banned_word.remove", "banned_word", word);
    return c.json({ ok: true });
  },
);

// —— أحياء حسب المدينة ——
adminRoutes.get(
  "/locations/districts",
  requireAdmin,
  requireAdminRoles("super_admin", "ops_admin"),
  async (c) => {
    const cityId = c.req.query("city_id");
    if (!cityId) return c.json({ error: "city_id مطلوب" }, 400);
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM districts WHERE city_id = ? ORDER BY name_ar`,
    )
      .bind(cityId)
      .all();
    return c.json({ districts: results ?? [] });
  },
);
