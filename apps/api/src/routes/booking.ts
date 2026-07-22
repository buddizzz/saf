import { Hono } from "hono";
import type { AppEnv } from "../lib/http";
import { isValidSaudiPhone, requireFields } from "../lib/http";
import { randomToken } from "../lib/crypto";
import { generateId } from "../lib/slug";
import {
  addDaysUTC,
  buildSlotsForDay,
  dayOfWeekSunday0,
  isValidTime,
  slotUnix,
  ymdUTC,
  type AvailabilityRow,
} from "../lib/booking";
import { isPro } from "../lib/subscription";
import { requireAuth } from "../middleware/auth";

export const bookingRoutes = new Hono<AppEnv>();

type ShopGate = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  subscription_tier: string;
  subscription_status: string;
  subscription_renews_at: number | null;
  is_active: number;
  suspended_at: number | null;
  theme_id: string;
  theme_custom: string | null;
  logo_url: string | null;
  tagline: string | null;
};

async function shopById(db: D1Database, id: string): Promise<ShopGate | null> {
  return db
    .prepare(
      `SELECT id, owner_id, name, slug, subscription_tier, subscription_status,
              subscription_renews_at, is_active, suspended_at,
              theme_id, theme_custom, logo_url, tagline
       FROM shops WHERE id = ?`,
    )
    .bind(id)
    .first<ShopGate>();
}

async function shopBySlug(
  db: D1Database,
  slug: string,
): Promise<ShopGate | null> {
  return db
    .prepare(
      `SELECT id, owner_id, name, slug, subscription_tier, subscription_status,
              subscription_renews_at, is_active, suspended_at,
              theme_id, theme_custom, logo_url, tagline
       FROM shops WHERE slug = ?`,
    )
    .bind(slug)
    .first<ShopGate>();
}

function bookingEnabled(shop: ShopGate): boolean {
  return (
    isPro(shop) &&
    shop.is_active === 1 &&
    !shop.suspended_at
  );
}

// إعدادات التوفّر للمالك (Pro).
bookingRoutes.get("/shops/:id/availability", requireAuth, async (c) => {
  const auth = c.get("auth");
  const shop = await shopById(c.env.DB, c.req.param("id"));
  if (!shop || shop.owner_id !== auth.sub) {
    return c.json({ error: "المحل غير موجود" }, 404);
  }
  if (!isPro(shop)) {
    return c.json({ error: "الحجز عن بُعد متاح في باقة Pro فقط", code: "pro_required" }, 403);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT id, day_of_week, start_time, end_time, slot_duration_minutes
     FROM shop_availability WHERE shop_id = ? ORDER BY day_of_week`,
  )
    .bind(shop.id)
    .all();
  return c.json({ availability: results ?? [] });
});

bookingRoutes.patch("/shops/:id/availability", requireAuth, async (c) => {
  const auth = c.get("auth");
  const shop = await shopById(c.env.DB, c.req.param("id"));
  if (!shop || shop.owner_id !== auth.sub) {
    return c.json({ error: "المحل غير موجود" }, 404);
  }
  if (!isPro(shop)) {
    return c.json({ error: "الحجز عن بُعد متاح في باقة Pro فقط", code: "pro_required" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const rows = body.availability as Array<{
    day_of_week: number;
    start_time: string;
    end_time: string;
    slot_duration_minutes?: number;
  }>;
  if (!Array.isArray(rows)) {
    return c.json({ error: "availability يجب أن يكون مصفوفة" }, 400);
  }

  for (const row of rows) {
    if (
      typeof row.day_of_week !== "number" ||
      row.day_of_week < 0 ||
      row.day_of_week > 6
    ) {
      return c.json({ error: "day_of_week غير صالح" }, 400);
    }
    if (!isValidTime(row.start_time) || !isValidTime(row.end_time)) {
      return c.json({ error: "صيغة الوقت غير صالحة (HH:MM)" }, 400);
    }
    const duration = row.slot_duration_minutes ?? 30;
    if (duration < 5 || duration > 240) {
      return c.json({ error: "مدة الموعد يجب أن تكون بين 5 و 240 دقيقة" }, 400);
    }
  }

  await c.env.DB.prepare("DELETE FROM shop_availability WHERE shop_id = ?")
    .bind(shop.id)
    .run();

  for (const row of rows) {
    const id = generateId("avail");
    await c.env.DB.prepare(
      `INSERT INTO shop_availability
        (id, shop_id, day_of_week, start_time, end_time, slot_duration_minutes)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        shop.id,
        row.day_of_week,
        row.start_time,
        row.end_time,
        row.slot_duration_minutes ?? 30,
      )
      .run();
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, day_of_week, start_time, end_time, slot_duration_minutes
     FROM shop_availability WHERE shop_id = ? ORDER BY day_of_week`,
  )
    .bind(shop.id)
    .all();
  return c.json({ availability: results ?? [] });
});

bookingRoutes.get("/shops/:id/appointments", requireAuth, async (c) => {
  const auth = c.get("auth");
  const shop = await shopById(c.env.DB, c.req.param("id"));
  if (!shop || shop.owner_id !== auth.sub) {
    return c.json({ error: "المحل غير موجود" }, 404);
  }
  const from = Number(c.req.query("from") ?? Math.floor(Date.now() / 1000));
  const { results } = await c.env.DB.prepare(
    `SELECT id, customer_name, phone, appointment_time, duration_minutes, status, created_at
     FROM appointments
     WHERE shop_id = ? AND appointment_time >= ? AND status != 'cancelled'
     ORDER BY appointment_time ASC LIMIT 200`,
  )
    .bind(shop.id, from)
    .all();
  return c.json({ appointments: results ?? [] });
});

// واجهة عامة للحجز
bookingRoutes.get("/book/:slug", async (c) => {
  const shop = await shopBySlug(c.env.DB, c.req.param("slug"));
  if (!shop || shop.is_active !== 1 || shop.suspended_at) {
    return c.json({ error: "المحل غير موجود" }, 404);
  }
  if (!isPro(shop)) {
    return c.json(
      { error: "الحجز عن بُعد غير متاح لهذا المحل", code: "pro_required" },
      403,
    );
  }
  return c.json({
    shop: {
      id: shop.id,
      name: shop.name,
      slug: shop.slug,
      theme_id: shop.theme_id,
      theme_custom: shop.theme_custom,
      logo_url: shop.logo_url,
      tagline: shop.tagline,
      booking_enabled: true,
    },
  });
});

bookingRoutes.get("/book/:slug/availability", async (c) => {
  const shop = await shopBySlug(c.env.DB, c.req.param("slug"));
  if (!shop || !bookingEnabled(shop)) {
    return c.json(
      { error: "الحجز عن بُعد غير متاح لهذا المحل", code: "booking_unavailable" },
      403,
    );
  }

  const { results: availRows } = await c.env.DB.prepare(
    `SELECT day_of_week, start_time, end_time, slot_duration_minutes
     FROM shop_availability WHERE shop_id = ?`,
  )
    .bind(shop.id)
    .all<AvailabilityRow>();

  const byDay = new Map<number, AvailabilityRow>();
  for (const row of availRows ?? []) byDay.set(row.day_of_week, row);

  const now = Math.floor(Date.now() / 1000);
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = addDaysUTC(start, 7);
  const rangeStart = Math.floor(start.getTime() / 1000);
  const rangeEnd = Math.floor(end.getTime() / 1000);

  const { results: booked } = await c.env.DB.prepare(
    `SELECT appointment_time, duration_minutes FROM appointments
     WHERE shop_id = ? AND status = 'confirmed'
       AND appointment_time >= ? AND appointment_time < ?`,
  )
    .bind(shop.id, rangeStart, rangeEnd)
    .all<{ appointment_time: number; duration_minutes: number }>();

  const days: Array<{ date: string; slots: string[] }> = [];
  for (let i = 0; i < 7; i++) {
    const day = addDaysUTC(start, i);
    const dow = dayOfWeekSunday0(day);
    const slots = buildSlotsForDay(
      day,
      byDay.get(dow),
      booked ?? [],
      now,
    );
    days.push({ date: ymdUTC(day), slots });
  }

  return c.json({ days, shop: { name: shop.name, slug: shop.slug } });
});

bookingRoutes.post("/appointments", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const err = requireFields(body, [
    "shop_slug",
    "customer_name",
    "phone",
    "date",
    "time",
  ]);
  if (err) return c.json({ error: err }, 400);
  if (!isValidSaudiPhone(body.phone)) {
    return c.json({ error: "رقم الجوال يجب أن يكون بصيغة +9665XXXXXXXX" }, 400);
  }

  const shop = await shopBySlug(c.env.DB, body.shop_slug);
  if (!shop || !bookingEnabled(shop)) {
    return c.json({ error: "الحجز غير متاح", code: "booking_unavailable" }, 403);
  }

  const when = slotUnix(body.date, body.time);
  if (!when) return c.json({ error: "تاريخ أو وقت غير صالح" }, 400);
  if (when <= Math.floor(Date.now() / 1000)) {
    return c.json({ error: "لا يمكن حجز وقت في الماضي" }, 400);
  }

  const day = new Date(when * 1000);
  const dow = dayOfWeekSunday0(day);
  const avail = await c.env.DB.prepare(
    `SELECT day_of_week, start_time, end_time, slot_duration_minutes
     FROM shop_availability WHERE shop_id = ? AND day_of_week = ?`,
  )
    .bind(shop.id, dow)
    .first<AvailabilityRow>();
  if (!avail) return c.json({ error: "لا تتوفر مواعيد في هذا اليوم" }, 400);

  const dayStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const { results: booked } = await c.env.DB.prepare(
    `SELECT appointment_time, duration_minutes FROM appointments
     WHERE shop_id = ? AND status = 'confirmed'
       AND appointment_time >= ? AND appointment_time < ?`,
  )
    .bind(
      shop.id,
      Math.floor(dayStart.getTime() / 1000),
      Math.floor(addDaysUTC(dayStart, 1).getTime() / 1000),
    )
    .all<{ appointment_time: number; duration_minutes: number }>();

  const slots = buildSlotsForDay(dayStart, avail, booked ?? [], Math.floor(Date.now() / 1000) - 1);
  if (!slots.includes(body.time)) {
    return c.json({ error: "هذا الموعد لم يعد متاحًا" }, 409);
  }

  await c.env.DB.prepare(
    `INSERT INTO customers (phone, name, last_visit_at)
     VALUES (?, ?, unixepoch())
     ON CONFLICT(phone) DO UPDATE SET
       name = excluded.name,
       last_visit_at = excluded.last_visit_at`,
  )
    .bind(body.phone, body.customer_name)
    .run();

  const id = generateId("appt");
  const cancelToken = randomToken(24);
  const duration = avail.slot_duration_minutes;

  try {
    await c.env.DB.prepare(
      `INSERT INTO appointments
        (id, shop_id, phone, customer_name, appointment_time, duration_minutes, status, cancel_token)
       VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?)`,
    )
      .bind(id, shop.id, body.phone, body.customer_name, when, duration, cancelToken)
      .run();
  } catch {
    return c.json({ error: "تعذّر إنشاء الموعد، حاول مرة أخرى" }, 409);
  }

  return c.json(
    {
      appointment: {
        id,
        shop_name: shop.name,
        appointment_time: when,
        duration_minutes: duration,
        status: "confirmed",
        cancel_token: cancelToken,
      },
    },
    201,
  );
});

bookingRoutes.delete("/appointments/:id", async (c) => {
  const id = c.req.param("id");
  const token = c.req.query("token");
  const authHeader = c.req.header("Authorization");

  const appt = await c.env.DB.prepare(
    `SELECT a.id, a.shop_id, a.cancel_token, a.status, s.owner_id
     FROM appointments a
     JOIN shops s ON s.id = a.shop_id
     WHERE a.id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      shop_id: string;
      cancel_token: string;
      status: string;
      owner_id: string;
    }>();

  if (!appt) return c.json({ error: "الموعد غير موجود" }, 404);
  if (appt.status === "cancelled") return c.json({ ok: true });

  let allowed = false;
  if (token && token === appt.cancel_token) allowed = true;

  if (!allowed && authHeader?.startsWith("Bearer ")) {
    const { readToken } = await import("../lib/jwt");
    const payload = await readToken(c.env.JWT_SECRET, authHeader.slice(7));
    if (payload?.role === "owner" && payload.sub === appt.owner_id) {
      allowed = true;
    }
  }

  if (!allowed) return c.json({ error: "غير مصرّح" }, 403);

  await c.env.DB.prepare(
    `UPDATE appointments SET status = 'cancelled' WHERE id = ?`,
  )
    .bind(id)
    .run();

  return c.json({ ok: true });
});
