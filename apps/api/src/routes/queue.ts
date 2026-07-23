import { Hono } from "hono";
import type { AppEnv } from "../lib/http";
import { isValidSaudiPhone, requireFields } from "../lib/http";
import { isWithinWorkingHours } from "../lib/hours";
import { requireAuth } from "../middleware/auth";
import { encryptPhone } from "../lib/phone-crypto";
import { touchShopActivity } from "../lib/activity";
import { clientIp, rateLimit } from "../lib/rate-limit";
import {
  callNext,
  completeCurrent,
  getBySession,
  getSnapshot,
  joinQueue,
  rateEntry,
  skipCurrent,
} from "../lib/queue";

export const queueRoutes = new Hono<AppEnv>();

function stubFor(c: { env: AppEnv["Bindings"] }, shopId: string) {
  const id = c.env.SHOP_QUEUE.idFromName(shopId);
  return c.env.SHOP_QUEUE.get(id);
}

// يسمح للمالك (الذي يملك المحل) أو الموظف (المقيّد بنطاق المحل) بالتحكم بالطابور.
async function canControlShop(
  c: { env: AppEnv["Bindings"] },
  auth: AppEnv["Variables"]["auth"],
  shopId: string,
): Promise<boolean> {
  if (auth.role === "staff") return auth.shopScope === shopId;
  const shop = await c.env.DB.prepare(
    "SELECT id FROM shops WHERE id = ? AND owner_id = ?",
  )
    .bind(shopId, auth.sub)
    .first();
  return !!shop;
}

// انضمام عميل للطابور عبر رابط المحل.
queueRoutes.post("/join", async (c) => {
  const ip = clientIp(c);
  const rl = rateLimit(`queue-join:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return c.json(
      { error: "محاولات كثيرة، حاول لاحقًا", retry_after: rl.retryAfterSec },
      429,
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const err = requireFields(body, ["slug", "name", "phone"]);
  if (err) return c.json({ error: err }, 400);
  if (!isValidSaudiPhone(body.phone)) {
    return c.json({ error: "رقم الجوال يجب أن يكون بصيغة +9665XXXXXXXX" }, 400);
  }
  if (body.consent !== true) {
    return c.json({ error: "الموافقة على حفظ البيانات مطلوبة" }, 400);
  }

  const shop = await c.env.DB.prepare(
    `SELECT id, is_active, is_accepting_queue, working_hours,
            country_code, city_id, district_id, lat, lng
     FROM shops WHERE slug = ?`,
  )
    .bind(body.slug)
    .first<{
      id: string;
      is_active: number;
      is_accepting_queue: number;
      working_hours: string | null;
    }>();
  if (!shop) return c.json({ error: "المحل غير موجود" }, 404);
  if (shop.is_accepting_queue !== 1 || shop.is_active !== 1) {
    return c.json({ error: "المحل لا يستقبل عملاء حاليًا" }, 409);
  }
  if (!isWithinWorkingHours(shop.working_hours)) {
    return c.json({ error: "المحل مغلق حاليًا خارج ساعات العمل" }, 409);
  }

  const customerLat =
    typeof body.lat === "number" && Number.isFinite(body.lat) ? body.lat : null;
  const customerLng =
    typeof body.lng === "number" && Number.isFinite(body.lng) ? body.lng : null;

  const phoneCipher = await encryptPhone(c.env, body.phone);

  const entry = await joinQueue(c.env.DB, shop.id, {
    name: body.name,
    phone: body.phone,
    gender: body.gender ?? null,
    ageCategory: body.age_category ?? null,
    consent: true,
    marketingConsent: body.marketing_consent === true,
    lat: customerLat,
    lng: customerLng,
    phoneCipher,
  });

  await touchShopActivity(c.env.DB, shop.id);
  await stubFor(c, shop.id).broadcast(shop.id);
  const snapshot = await getSnapshot(c.env.DB, shop.id);

  return c.json(
    {
      queueNumber: entry.queue_number,
      sessionToken: entry.session_token,
      shopId: shop.id,
      snapshot,
    },
    201,
  );
});

// استرجاع حالة العميل عبر session token (بعد إعادة فتح الصفحة).
queueRoutes.get("/session/:token", async (c) => {
  const result = await getBySession(c.env.DB, c.req.param("token"));
  if (!result) return c.json({ error: "الجلسة غير موجودة" }, 404);
  const { entry, snapshot } = result;
  return c.json({
    entry: {
      queueNumber: entry.queue_number,
      name: entry.customer_name,
      status: entry.status,
      shopId: entry.shop_id,
    },
    snapshot,
  });
});

// تقييم بعد الخدمة.
queueRoutes.post("/session/:token/rating", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return c.json({ error: "التقييم يجب أن يكون بين 1 و 5" }, 400);
  }
  const ok = await rateEntry(c.env.DB, c.req.param("token"), rating);
  if (!ok) return c.json({ error: "لا يمكن التقييم قبل انتهاء الخدمة" }, 409);
  return c.json({ ok: true });
});

// ترقية WebSocket → توجيه إلى الكائن الدائم للمحل.
queueRoutes.get("/:shopId/ws", async (c) => {
  const shopId = c.req.param("shopId");
  const url = new URL(c.req.url);
  url.searchParams.set("shopId", shopId);
  return stubFor(c, shopId).fetch(new Request(url.toString(), c.req.raw));
});

// قائمة اليوم (لصاحب المحل).
queueRoutes.get("/:shopId/list", requireAuth, async (c) => {
  const auth = c.get("auth");
  const shopId = c.req.param("shopId");
  if (!(await canControlShop(c, auth, shopId))) {
    return c.json({ error: "غير مصرّح لهذا المحل" }, 403);
  }
  const snapshot = await getSnapshot(c.env.DB, shopId);
  return c.json({ snapshot });
});

// استدعاء العميل التالي.
queueRoutes.post("/:shopId/next", requireAuth, async (c) => {
  const auth = c.get("auth");
  const shopId = c.req.param("shopId");
  if (!(await canControlShop(c, auth, shopId))) {
    return c.json({ error: "غير مصرّح لهذا المحل" }, 403);
  }
  await touchShopActivity(c.env.DB, shopId);
  const number = await callNext(c.env.DB, shopId);
  if (number === null) {
    await stubFor(c, shopId).broadcast(shopId);
    return c.json({ called: null, message: "لا يوجد عملاء في الانتظار" });
  }
  await stubFor(c, shopId).onCustomerCalled(shopId);
  return c.json({ called: number });
});

// تخطي العميل المستدعى حاليًا.
queueRoutes.post("/:shopId/skip", requireAuth, async (c) => {
  const auth = c.get("auth");
  const shopId = c.req.param("shopId");
  if (!(await canControlShop(c, auth, shopId))) {
    return c.json({ error: "غير مصرّح لهذا المحل" }, 403);
  }
  await touchShopActivity(c.env.DB, shopId);
  await skipCurrent(c.env.DB, shopId, "cancelled");
  await stubFor(c, shopId).broadcast(shopId);
  return c.json({ ok: true });
});

// إتمام خدمة العميل المستدعى حاليًا.
queueRoutes.post("/:shopId/complete", requireAuth, async (c) => {
  const auth = c.get("auth");
  const shopId = c.req.param("shopId");
  if (!(await canControlShop(c, auth, shopId))) {
    return c.json({ error: "غير مصرّح لهذا المحل" }, 403);
  }
  await touchShopActivity(c.env.DB, shopId);
  await completeCurrent(c.env.DB, shopId);
  await stubFor(c, shopId).broadcast(shopId);
  return c.json({ ok: true });
});
