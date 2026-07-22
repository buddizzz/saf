export interface ShopLocationRow {
  id: string;
  country_code: string | null;
  city_id: string | null;
  district_id: string | null;
  lat: number | null;
  lng: number | null;
}

export interface VisitCustomerInput {
  phone: string;
  name: string;
  gender?: string | null;
  ageCategory?: string | null;
  marketingConsent?: boolean;
  /** إحداثيات اختيارية من جهاز العميل عند الانضمام */
  lat?: number | null;
  lng?: number | null;
}

/**
 * يسجّل/يحدّث العميل الموحّد + زيارة المحل، وينسخ موقع المحل إلى
 * last_* للعميل ليستخدم لاحقًا في استهداف حملات واتساب بالحي/المدينة.
 */
export async function recordCustomerVisit(
  db: D1Database,
  shop: ShopLocationRow,
  input: VisitCustomerInput,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const gender = input.gender ?? null;
  const age = input.ageCategory ?? null;
  const marketing = input.marketingConsent ? 1 : 0;
  const lat = input.lat ?? shop.lat ?? null;
  const lng = input.lng ?? shop.lng ?? null;

  await db
    .prepare(
      `INSERT INTO customers (
         phone, name, gender, age_category,
         last_country_code, last_city_id, last_district_id,
         last_lat, last_lng,
         marketing_consent, last_visit_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET
         name = excluded.name,
         gender = COALESCE(excluded.gender, customers.gender),
         age_category = COALESCE(excluded.age_category, customers.age_category),
         last_country_code = COALESCE(excluded.last_country_code, customers.last_country_code),
         last_city_id = COALESCE(excluded.last_city_id, customers.last_city_id),
         last_district_id = COALESCE(excluded.last_district_id, customers.last_district_id),
         last_lat = COALESCE(excluded.last_lat, customers.last_lat),
         last_lng = COALESCE(excluded.last_lng, customers.last_lng),
         marketing_consent = CASE
           WHEN excluded.marketing_consent = 1 THEN 1
           ELSE customers.marketing_consent
         END,
         last_visit_at = excluded.last_visit_at`,
    )
    .bind(
      input.phone,
      input.name,
      gender,
      age,
      shop.country_code,
      shop.city_id,
      shop.district_id,
      lat,
      lng,
      marketing,
      now,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO customer_shop_visits (
         phone, shop_id, first_visit_at, last_visit_at, visit_count,
         last_gender, last_age_category
       ) VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(phone, shop_id) DO UPDATE SET
         last_visit_at = excluded.last_visit_at,
         visit_count = customer_shop_visits.visit_count + 1,
         last_gender = COALESCE(excluded.last_gender, customer_shop_visits.last_gender),
         last_age_category = COALESCE(excluded.last_age_category, customer_shop_visits.last_age_category)`,
    )
    .bind(input.phone, shop.id, now, now, gender, age)
    .run();
}

export interface AudienceFilters {
  cityId?: string | null;
  districtId?: string | null;
  gender?: string | null;
  ageCategory?: string | null;
  excludeShopId?: string | null;
  limit?: number;
}

/** عملاء سابقون لمحل معيّن (مع موافقة تسويق) — لحملة "عملاء سابقون". */
export async function listPastCustomers(
  db: D1Database,
  shopId: string,
  filters: AudienceFilters = {},
): Promise<Array<Record<string, unknown>>> {
  const limit = Math.min(filters.limit ?? 200, 500);
  const clauses = [
    "v.shop_id = ?",
    "c.marketing_consent = 1",
    "c.marketing_opted_out_at IS NULL",
  ];
  const binds: unknown[] = [shopId];

  if (filters.gender) {
    clauses.push("c.gender = ?");
    binds.push(filters.gender);
  }
  if (filters.ageCategory) {
    clauses.push("c.age_category = ?");
    binds.push(filters.ageCategory);
  }

  binds.push(limit);
  const { results } = await db
    .prepare(
      `SELECT c.phone, c.name, c.gender, c.age_category,
              c.last_country_code, c.last_city_id, c.last_district_id,
              c.last_lat, c.last_lng,
              v.visit_count, v.last_visit_at
       FROM customer_shop_visits v
       JOIN customers c ON c.phone = v.phone
       WHERE ${clauses.join(" AND ")}
       ORDER BY v.last_visit_at DESC
       LIMIT ?`,
    )
    .bind(...binds)
    .all();
  return results ?? [];
}

/**
 * عملاء جدد في منطقة (وافقوا على التسويق) لم يزوروا المحل من قبل —
 * أساس حملة "اكتساب في الحي/المدينة".
 */
export async function listNewInArea(
  db: D1Database,
  filters: AudienceFilters,
): Promise<Array<Record<string, unknown>>> {
  const limit = Math.min(filters.limit ?? 200, 500);
  if (!filters.cityId && !filters.districtId) {
    return [];
  }

  const clauses = [
    "c.marketing_consent = 1",
    "c.marketing_opted_out_at IS NULL",
  ];
  const binds: unknown[] = [];

  if (filters.districtId) {
    clauses.push("c.last_district_id = ?");
    binds.push(filters.districtId);
  } else if (filters.cityId) {
    clauses.push("c.last_city_id = ?");
    binds.push(filters.cityId);
  }
  if (filters.gender) {
    clauses.push("c.gender = ?");
    binds.push(filters.gender);
  }
  if (filters.ageCategory) {
    clauses.push("c.age_category = ?");
    binds.push(filters.ageCategory);
  }
  if (filters.excludeShopId) {
    clauses.push(
      `NOT EXISTS (
         SELECT 1 FROM customer_shop_visits v
         WHERE v.phone = c.phone AND v.shop_id = ?
       )`,
    );
    binds.push(filters.excludeShopId);
  }

  binds.push(limit);
  const { results } = await db
    .prepare(
      `SELECT c.phone, c.name, c.gender, c.age_category,
              c.last_country_code, c.last_city_id, c.last_district_id,
              c.last_lat, c.last_lng, c.last_visit_at
       FROM customers c
       WHERE ${clauses.join(" AND ")}
       ORDER BY c.last_visit_at DESC
       LIMIT ?`,
    )
    .bind(...binds)
    .all();
  return results ?? [];
}
