import { Hono } from "hono";
import type { AppEnv } from "../lib/http";
import { requireFields } from "../lib/http";
import { generateId, generateSlug, normalizeCustomSlug } from "../lib/slug";
import { hashPassword } from "../lib/crypto";
import { isWithinWorkingHours } from "../lib/hours";
import {
  canUseTheme,
  isPro,
  staffLimit,
} from "../lib/subscription";
import {
  distanceKm,
  geocodeFromKsaDataset,
  parseCoords,
  reverseGeocodeKsa,
} from "../lib/ksa-geo";
import { listNewInArea, listPastCustomers } from "../lib/visits";
import { requireAuth } from "../middleware/auth";

export const shopRoutes = new Hono<AppEnv>();

const SHOP_TYPES = ["barber", "restaurant", "clinic", "salon", "other"];

async function resolveShopGeo(
  db: D1Database,
  input: {
    lat?: unknown;
    lng?: unknown;
    country_code?: string | null;
    city_id?: string | null;
    district_id?: string | null;
    district_name_free?: string | null;
  },
): Promise<{
  lat: number | null;
  lng: number | null;
  osm_place_id: string | null;
  osm_display_name: string | null;
  location_source: string;
  district_name_free: string | null;
  city_id?: string | null;
  district_id?: string | null;
  region_id?: string | null;
}> {
  const gps = parseCoords(input.lat, input.lng);
  const districtFree = input.district_name_free ?? null;

  if (gps) {
    const place = await reverseGeocodeKsa(db, gps.lat, gps.lng);
    return {
      lat: gps.lat,
      lng: gps.lng,
      osm_place_id: place?.place_id ?? null,
      osm_display_name: place?.display_name ?? null,
      location_source: "gps",
      district_name_free: districtFree || place?.district_name || null,
      city_id: place?.city_id ?? input.city_id ?? null,
      district_id: place?.district_id ?? input.district_id ?? null,
      region_id: place?.region_id ?? null,
    };
  }

  const place = await geocodeFromKsaDataset(db, {
    city_id: input.city_id,
    district_id: input.district_id,
    district_name_free: districtFree,
  });

  if (place) {
    return {
      lat: place.lat,
      lng: place.lng,
      osm_place_id: place.place_id,
      osm_display_name: place.display_name,
      location_source: "ksa_dataset",
      district_name_free: districtFree || place.district_name || null,
      city_id: place.city_id ?? input.city_id ?? null,
      district_id: place.district_id ?? input.district_id ?? null,
      region_id: place.region_id ?? null,
    };
  }

  return {
    lat: null,
    lng: null,
    osm_place_id: null,
    osm_display_name: null,
    location_source: "none",
    district_name_free: districtFree,
    city_id: input.city_id ?? null,
    district_id: input.district_id ?? null,
  };
}

// التحقق من توفّر slug مخصص (قبل مسار /:slug).
shopRoutes.get("/slug-available", requireAuth, async (c) => {
  const raw = c.req.query("slug") ?? "";
  const slug = normalizeCustomSlug(raw);
  if (!slug) {
    return c.json({ available: false, reason: "صيغة الرابط غير صالحة" });
  }
  const reserved = await c.env.DB.prepare(
    "SELECT slug FROM reserved_slugs WHERE slug = ?",
  )
    .bind(slug)
    .first();
  if (reserved) {
    return c.json({ available: false, reason: "هذا الرابط محجوز" });
  }
  const clash = await c.env.DB.prepare("SELECT id FROM shops WHERE slug = ?")
    .bind(slug)
    .first();
  return c.json({
    available: !clash,
    reason: clash ? "الرابط مستخدم بالفعل" : null,
  });
});

// محلات مرتّبة جغرافيًا (للحملات / الاستكشاف) — قبل مسار /:slug.
shopRoutes.get("/by-location", requireAuth, async (c) => {
  const cityId = c.req.query("city_id");
  const districtId = c.req.query("district_id");
  const country = c.req.query("country_code") ?? "SA";
  const origin = parseCoords(c.req.query("lat"), c.req.query("lng"));
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);

  const clauses = ["suspended_at IS NULL", "is_active = 1"];
  const binds: unknown[] = [];
  if (country) {
    clauses.push("country_code = ?");
    binds.push(country);
  }
  if (cityId) {
    clauses.push("city_id = ?");
    binds.push(cityId);
  }
  if (districtId) {
    clauses.push("district_id = ?");
    binds.push(districtId);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, name, slug, shop_type, country_code, city_id, district_id,
            district_name_free, lat, lng, osm_display_name, location_source,
            subscription_tier
     FROM shops
     WHERE ${clauses.join(" AND ")}
     LIMIT 200`,
  )
    .bind(...binds)
    .all<{
      id: string;
      name: string;
      slug: string;
      shop_type: string;
      country_code: string;
      city_id: string | null;
      district_id: string | null;
      district_name_free: string | null;
      lat: number | null;
      lng: number | null;
      osm_display_name: string | null;
      location_source: string | null;
      subscription_tier: string;
    }>();

  let shops = results ?? [];
  if (origin) {
    shops = shops
      .map((s) => ({
        ...s,
        distance_km:
          s.lat != null && s.lng != null
            ? Math.round(distanceKm(origin, { lat: s.lat, lng: s.lng }) * 100) /
              100
            : null,
      }))
      .sort((a, b) => {
        if (a.distance_km == null && b.distance_km == null) return 0;
        if (a.distance_km == null) return 1;
        if (b.distance_km == null) return -1;
        return a.distance_km - b.distance_km;
      });
  } else {
    shops = shops.sort((a, b) =>
      `${a.city_id ?? ""}${a.district_id ?? ""}${a.name}`.localeCompare(
        `${b.city_id ?? ""}${b.district_id ?? ""}${b.name}`,
        "ar",
      ),
    );
  }

  return c.json({ shops: shops.slice(0, limit), origin });
});

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

  const geo = await resolveShopGeo(c.env.DB, body);
  const now = Math.floor(Date.now() / 1000);
  const id = generateId("shop");
  const cityId = body.city_id ?? geo.city_id ?? null;
  const districtId = body.district_id ?? geo.district_id ?? null;
  await c.env.DB.prepare(
    `INSERT INTO shops
      (id, owner_id, name, slug, shop_type, country_code, city_id, district_id,
       district_name_free, lat, lng, working_hours,
       osm_place_id, osm_display_name, location_source, location_updated_at,
       last_activity_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
  )
    .bind(
      id,
      auth.sub,
      body.name,
      slug,
      body.shop_type,
      body.country_code,
      cityId,
      districtId,
      geo.district_name_free,
      geo.lat,
      geo.lng,
      body.working_hours ? JSON.stringify(body.working_hours) : null,
      geo.osm_place_id,
      geo.osm_display_name,
      geo.location_source,
      geo.lat != null ? now : null,
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
    `SELECT id, name, slug, shop_type, theme_id, theme_custom, logo_url, tagline,
            is_active, is_accepting_queue, working_hours, subscription_tier,
            subscription_status, subscription_renews_at, hide_powered_by,
            avg_service_seconds, suspended_at
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
      subscription_status: string;
      subscription_renews_at: number | null;
      hide_powered_by: number | null;
      suspended_at: number | null;
    }>();

  if (!shop || shop.suspended_at) {
    return c.json({ error: "المحل غير موجود" }, 404);
  }

  const withinHours = isWithinWorkingHours(shop.working_hours);
  const isOpen =
    shop.is_active === 1 && shop.is_accepting_queue === 1 && withinHours;
  let closedReason: string | null = null;
  if (shop.is_accepting_queue !== 1) {
    closedReason = "المحل أوقف استقبال العملاء مؤقتًا";
  } else if (!withinHours) {
    closedReason = "المحل مغلق حاليًا خارج ساعات العمل";
  }

  const pro = isPro(shop);
  return c.json({
    shop: {
      ...shop,
      isOpen,
      closedReason,
      is_pro: pro,
      hide_powered_by: pro && shop.hide_powered_by === 1 ? 1 : 0,
      booking_enabled: pro,
    },
  });
});

// تحديث المحل (تبديل استقبال العملاء، الثيم، ساعات العمل...).
shopRoutes.patch("/:id", requireAuth, async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const shop = await c.env.DB.prepare(
    `SELECT id, subscription_tier, subscription_status, subscription_renews_at
     FROM shops WHERE id = ? AND owner_id = ?`,
  )
    .bind(id, auth.sub)
    .first<{
      id: string;
      subscription_tier: string;
      subscription_status: string;
      subscription_renews_at: number | null;
    }>();
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
    if (!canUseTheme(shop, body.theme_id)) {
      return c.json(
        { error: "هذا القالب متاح في باقة Pro فقط", code: "pro_required" },
        403,
      );
    }
    updates.push("theme_id = ?");
    values.push(body.theme_id);
  }
  if (body.working_hours !== undefined) {
    updates.push("working_hours = ?");
    values.push(body.working_hours ? JSON.stringify(body.working_hours) : null);
  }
  if (body.theme_custom !== undefined) {
    if (body.theme_custom === null) {
      updates.push("theme_custom = ?");
      values.push(null);
    } else if (
      typeof body.theme_custom === "object" &&
      Object.values(body.theme_custom).every(
        (v) => typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v),
      )
    ) {
      updates.push("theme_custom = ?");
      values.push(JSON.stringify(body.theme_custom));
    } else {
      return c.json({ error: "ألوان الهوية التجارية غير صالحة" }, 400);
    }
  }
  if (body.tagline !== undefined) {
    const tagline = typeof body.tagline === "string" ? body.tagline.trim() : "";
    if (tagline.length > 80) {
      return c.json({ error: "الشعار النصي طويل جدًا (80 حرفًا كحد أقصى)" }, 400);
    }
    updates.push("tagline = ?");
    values.push(tagline || null);
  }
  if (typeof body.slug === "string") {
    if (!isPro(shop)) {
      return c.json(
        { error: "الرابط المخصص متاح في باقة Pro فقط", code: "pro_required" },
        403,
      );
    }
    const slug = normalizeCustomSlug(body.slug);
    if (!slug) {
      return c.json({ error: "صيغة الرابط غير صالحة (3–30 حرفًا، a-z و 0-9 و -)" }, 400);
    }
    const reserved = await c.env.DB.prepare(
      "SELECT slug FROM reserved_slugs WHERE slug = ?",
    )
      .bind(slug)
      .first();
    if (reserved) return c.json({ error: "هذا الرابط محجوز" }, 409);
    const clash = await c.env.DB.prepare(
      "SELECT id FROM shops WHERE slug = ? AND id != ?",
    )
      .bind(slug, id)
      .first();
    if (clash) return c.json({ error: "الرابط مستخدم بالفعل" }, 409);
    updates.push("slug = ?");
    values.push(slug);
    updates.push("slug_type = ?");
    values.push("custom");
  }
  if (typeof body.hide_powered_by === "boolean") {
    if (!isPro(shop)) {
      return c.json(
        { error: "إخفاء علامة صفّ متاح في باقة Pro فقط", code: "pro_required" },
        403,
      );
    }
    updates.push("hide_powered_by = ?");
    values.push(body.hide_powered_by ? 1 : 0);
  }

  // تحديث الموقع: GPS من المتصفح و/أو دولة/مدينة/حي → إثراء OSM.
  const wantsGeo =
    body.lat !== undefined ||
    body.lng !== undefined ||
    body.city_id !== undefined ||
    body.district_id !== undefined ||
    body.district_name_free !== undefined ||
    body.refresh_location === true;

  if (wantsGeo) {
    const current = await c.env.DB.prepare(
      `SELECT country_code, city_id, district_id, district_name_free, lat, lng
       FROM shops WHERE id = ?`,
    )
      .bind(id)
      .first<{
        country_code: string | null;
        city_id: string | null;
        district_id: string | null;
        district_name_free: string | null;
        lat: number | null;
        lng: number | null;
      }>();

    if (body.city_id !== undefined) {
      updates.push("city_id = ?");
      values.push(body.city_id || null);
    }
    if (body.district_id !== undefined) {
      updates.push("district_id = ?");
      values.push(body.district_id || null);
    }

    const geo = await resolveShopGeo(c.env.DB, {
      lat: body.lat !== undefined ? body.lat : current?.lat,
      lng: body.lng !== undefined ? body.lng : current?.lng,
      country_code: current?.country_code,
      city_id:
        body.city_id !== undefined ? body.city_id || null : current?.city_id,
      district_id:
        body.district_id !== undefined
          ? body.district_id || null
          : current?.district_id,
      district_name_free:
        body.district_name_free !== undefined
          ? body.district_name_free
          : current?.district_name_free,
    });

    updates.push("lat = ?");
    values.push(geo.lat);
    updates.push("lng = ?");
    values.push(geo.lng);
    updates.push("osm_place_id = ?");
    values.push(geo.osm_place_id);
    updates.push("osm_display_name = ?");
    values.push(geo.osm_display_name);
    updates.push("location_source = ?");
    values.push(geo.location_source);
    updates.push("location_updated_at = ?");
    values.push(Math.floor(Date.now() / 1000));
    updates.push("district_name_free = ?");
    values.push(geo.district_name_free);
  }

  if (updates.length === 0) {
    return c.json({ error: "لا توجد حقول للتحديث" }, 400);
  }

  updates.push("last_activity_at = unixepoch()");

  values.push(id);
  await c.env.DB.prepare(`UPDATE shops SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  const updated = await c.env.DB.prepare("SELECT * FROM shops WHERE id = ?")
    .bind(id)
    .first();
  return c.json({ shop: updated });
});

const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

// رفع شعار المحل (الهوية التجارية) — يخزَّن في R2 ويُقدَّم عبر /assets/:key.
shopRoutes.post("/:id/logo", requireAuth, async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");
  const shop = await c.env.DB.prepare(
    "SELECT id, logo_url FROM shops WHERE id = ? AND owner_id = ?",
  )
    .bind(id, auth.sub)
    .first<{ id: string; logo_url: string | null }>();
  if (!shop) return c.json({ error: "المحل غير موجود" }, 404);

  const form = await c.req.formData().catch(() => null);
  const entry = form?.get("file");
  if (!entry || typeof entry === "string") {
    return c.json({ error: "لم يتم إرفاق ملف" }, 400);
  }
  const file = entry as File;
  const ext = LOGO_TYPES[file.type];
  if (!ext) {
    return c.json({ error: "صيغة الصورة غير مدعومة (PNG/JPG/WEBP/SVG)" }, 400);
  }
  if (file.size > LOGO_MAX_BYTES) {
    return c.json({ error: "حجم الصورة يجب أن يكون أقل من 2 ميغابايت" }, 400);
  }

  const key = `logo-${id}-${Date.now()}.${ext}`;
  await c.env.BRAND_ASSETS.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const previousKey = shop.logo_url?.startsWith("/assets/")
    ? shop.logo_url.slice("/assets/".length)
    : null;

  await c.env.DB.prepare("UPDATE shops SET logo_url = ? WHERE id = ?")
    .bind(`/assets/${key}`, id)
    .run();

  if (previousKey) {
    await c.env.BRAND_ASSETS.delete(previousKey).catch(() => undefined);
  }

  const updated = await c.env.DB.prepare("SELECT * FROM shops WHERE id = ?")
    .bind(id)
    .first();
  return c.json({ shop: updated });
});

// حذف شعار المحل والرجوع للحرف الأول كعلامة افتراضية.
shopRoutes.delete("/:id/logo", requireAuth, async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");
  const shop = await c.env.DB.prepare(
    "SELECT id, logo_url FROM shops WHERE id = ? AND owner_id = ?",
  )
    .bind(id, auth.sub)
    .first<{ id: string; logo_url: string | null }>();
  if (!shop) return c.json({ error: "المحل غير موجود" }, 404);

  const previousKey = shop.logo_url?.startsWith("/assets/")
    ? shop.logo_url.slice("/assets/".length)
    : null;
  if (previousKey) {
    await c.env.BRAND_ASSETS.delete(previousKey).catch(() => undefined);
  }

  await c.env.DB.prepare("UPDATE shops SET logo_url = NULL WHERE id = ?")
    .bind(id)
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

// معاينة جمهور الحملة (عملاء سابقون / جدد في المنطقة) — بدون كشف أرقام للغير.
shopRoutes.get("/:id/audience", requireAuth, async (c) => {
  const auth = c.get("auth");
  const shopId = c.req.param("id");
  if (!(await ownsShop(c, auth.sub, shopId))) {
    return c.json({ error: "غير مصرّح" }, 403);
  }

  const type = c.req.query("type") ?? "past_customers";
  const filters = {
    cityId: c.req.query("city_id"),
    districtId: c.req.query("district_id"),
    gender: c.req.query("gender"),
    ageCategory: c.req.query("age_category"),
    excludeShopId: shopId,
    limit: Number(c.req.query("limit") ?? 50),
  };

  if (type === "new_in_area") {
    if (!filters.cityId && !filters.districtId) {
      const shop = await c.env.DB.prepare(
        "SELECT city_id, district_id FROM shops WHERE id = ?",
      )
        .bind(shopId)
        .first<{ city_id: string | null; district_id: string | null }>();
      filters.cityId = shop?.city_id ?? undefined;
      filters.districtId = shop?.district_id ?? undefined;
    }
    const customers = await listNewInArea(c.env.DB, filters);
    return c.json({
      type,
      count: customers.length,
      // لا نُرجع أرقام الجوال للمالك — المنصة ترسل نيابةً عنه لاحقًا.
      customers: customers.map((row) => ({
        name: row.name,
        gender: row.gender,
        age_category: row.age_category,
        last_city_id: row.last_city_id,
        last_district_id: row.last_district_id,
        last_visit_at: row.last_visit_at,
      })),
    });
  }

  const customers = await listPastCustomers(c.env.DB, shopId, filters);
  return c.json({
    type: "past_customers",
    count: customers.length,
    customers: customers.map((row) => ({
      name: row.name,
      gender: row.gender,
      age_category: row.age_category,
      visit_count: row.visit_count,
      last_visit_at: row.last_visit_at,
      last_city_id: row.last_city_id,
      last_district_id: row.last_district_id,
    })),
  });
});

// سجل زيارات المحل (ملخص للحملات).
shopRoutes.get("/:id/visits", requireAuth, async (c) => {
  const auth = c.get("auth");
  const shopId = c.req.param("id");
  if (!(await ownsShop(c, auth.sub, shopId))) {
    return c.json({ error: "غير مصرّح" }, 403);
  }

  const summary = await c.env.DB.prepare(
    `SELECT
       COUNT(*) AS unique_visitors,
       COALESCE(SUM(visit_count), 0) AS total_visits,
       SUM(CASE WHEN c.marketing_consent = 1 THEN 1 ELSE 0 END) AS marketing_opted_in
     FROM customer_shop_visits v
     JOIN customers c ON c.phone = v.phone
     WHERE v.shop_id = ?`,
  )
    .bind(shopId)
    .first();

  const byAge = await c.env.DB.prepare(
    `SELECT COALESCE(c.age_category, 'unknown') AS age_category, COUNT(*) AS n
     FROM customer_shop_visits v
     JOIN customers c ON c.phone = v.phone
     WHERE v.shop_id = ?
     GROUP BY COALESCE(c.age_category, 'unknown')`,
  )
    .bind(shopId)
    .all();

  return c.json({
    summary,
    by_age: byAge.results ?? [],
  });
});

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
  const shop = await c.env.DB.prepare(
    `SELECT id, subscription_tier, subscription_status, subscription_renews_at
     FROM shops WHERE id = ? AND owner_id = ?`,
  )
    .bind(shopId, auth.sub)
    .first<{
      id: string;
      subscription_tier: string;
      subscription_status: string;
      subscription_renews_at: number | null;
    }>();
  if (!shop) {
    return c.json({ error: "غير مصرّح" }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const err = requireFields(body, ["name", "pin"]);
  if (err) return c.json({ error: err }, 400);
  if (!/^\d{4,6}$/.test(String(body.pin))) {
    return c.json({ error: "رمز PIN يجب أن يكون 4 إلى 6 أرقام" }, 400);
  }

  const countRow = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM staff WHERE shop_id = ?",
  )
    .bind(shopId)
    .first<{ n: number }>();
  const limit = staffLimit(shop);
  if ((countRow?.n ?? 0) >= limit) {
    return c.json(
      {
        error: isPro(shop)
          ? `وصلت للحد الأقصى (${limit} موظفين)`
          : `الباقة المجانية تسمح بموظف واحد — رقِّ لـ Pro لإضافة المزيد`,
        code: "staff_limit",
      },
      403,
    );
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
