// إحداثيات ومسافات + ترميز جغرافي من بيانات السعودية المحلية
// (homaily / maps.address.gov.sa) بدل Nominatim لمدينة/حي.

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeoPlace {
  place_id: string;
  display_name: string;
  lat: number;
  lng: number;
  country_code?: string | null;
  region_id?: string | null;
  city_id?: string | null;
  district_id?: string | null;
  city_name?: string | null;
  district_name?: string | null;
  source: "gps" | "ksa_dataset" | "none";
}

function isValidCoordPair(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function parseCoords(lat: unknown, lng: unknown): GeoPoint | null {
  const a = typeof lat === "string" ? Number(lat) : lat;
  const b = typeof lng === "string" ? Number(lng) : lng;
  if (!isValidCoordPair(a, b)) return null;
  return { lat: a, lng: b as number };
}

/** مسافة تقريبية بالكيلومتر (Haversine). */
export function distanceKm(
  a: GeoPoint,
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type LocRow = {
  id: string;
  name_ar: string;
  name_en: string;
  lat: number | null;
  lng: number | null;
  region_id?: string | null;
  city_id?: string | null;
};

function nearest(
  origin: GeoPoint,
  rows: LocRow[],
  maxKm: number,
): { row: LocRow; distance_km: number } | null {
  let best: { row: LocRow; distance_km: number } | null = null;
  for (const row of rows) {
    if (row.lat == null || row.lng == null) continue;
    const d = distanceKm(origin, { lat: row.lat, lng: row.lng });
    if (d > maxKm) continue;
    if (!best || d < best.distance_km) best = { row, distance_km: d };
  }
  return best;
}

/**
 * ترميز مدينة/حي من جداول D1 المعبّأة من homaily.
 * يفضّل مركز الحي إن وُجد، وإلا مركز المدينة.
 */
export async function geocodeFromKsaDataset(
  db: D1Database,
  input: {
    city_id?: string | null;
    district_id?: string | null;
    district_name_free?: string | null;
  },
): Promise<GeoPlace | null> {
  let district: LocRow | null = null;
  let city: LocRow | null = null;

  if (input.district_id) {
    district = await db
      .prepare(
        `SELECT id, name_ar, name_en, lat, lng, region_id, city_id
         FROM districts WHERE id = ?`,
      )
      .bind(input.district_id)
      .first<LocRow>();
  }

  const cityId = input.city_id || district?.city_id;
  if (cityId) {
    city = await db
      .prepare(
        `SELECT id, name_ar, name_en, lat, lng, region_id
         FROM cities WHERE id = ?`,
      )
      .bind(cityId)
      .first<LocRow>();
  }

  // حي حر بالاسم داخل المدينة
  if (!district && city && input.district_name_free) {
    const q = `%${String(input.district_name_free).trim()}%`;
    district = await db
      .prepare(
        `SELECT id, name_ar, name_en, lat, lng, region_id, city_id
         FROM districts
         WHERE city_id = ? AND (name_ar LIKE ? OR name_en LIKE ?)
         LIMIT 1`,
      )
      .bind(city.id, q, q)
      .first<LocRow>();
  }

  const anchor = district?.lat != null ? district : city;
  if (!anchor || anchor.lat == null || anchor.lng == null) return null;

  const parts = [
    district?.name_ar,
    city?.name_ar,
    "السعودية",
  ].filter(Boolean);

  return {
    place_id: district
      ? `ksa:district:${district.id}`
      : `ksa:city:${city?.id}`,
    display_name: parts.join("، "),
    lat: anchor.lat,
    lng: anchor.lng,
    country_code: "SA",
    region_id: district?.region_id ?? city?.region_id ?? null,
    city_id: city?.id ?? null,
    district_id: district?.id ?? null,
    city_name: city?.name_ar ?? null,
    district_name: district?.name_ar ?? null,
    source: "ksa_dataset",
  };
}

/**
 * عكس GPS → أقرب حي/مدينة من مجموعة البيانات السعودية (مراكز فقط، بدون مضلعات).
 */
export async function reverseGeocodeKsa(
  db: D1Database,
  lat: number,
  lng: number,
): Promise<GeoPlace | null> {
  const origin = { lat, lng };
  // صندوق بحث ~55كم
  const delta = 0.5;
  const { results: districtHits } = await db
    .prepare(
      `SELECT id, name_ar, name_en, lat, lng, region_id, city_id
       FROM districts
       WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
       LIMIT 400`,
    )
    .bind(lat - delta, lat + delta, lng - delta, lng + delta)
    .all<LocRow>();

  const nearDistrict = nearest(origin, districtHits ?? [], 25);
  if (nearDistrict) {
    const city = nearDistrict.row.city_id
      ? await db
          .prepare(`SELECT id, name_ar, name_en, lat, lng, region_id FROM cities WHERE id = ?`)
          .bind(nearDistrict.row.city_id)
          .first<LocRow>()
      : null;
    return {
      place_id: `ksa:district:${nearDistrict.row.id}`,
      display_name: [nearDistrict.row.name_ar, city?.name_ar, "السعودية"]
        .filter(Boolean)
        .join("، "),
      lat,
      lng,
      country_code: "SA",
      region_id: nearDistrict.row.region_id ?? city?.region_id ?? null,
      city_id: city?.id ?? nearDistrict.row.city_id ?? null,
      district_id: nearDistrict.row.id,
      city_name: city?.name_ar ?? null,
      district_name: nearDistrict.row.name_ar,
      source: "gps",
    };
  }

  const { results: cityHits } = await db
    .prepare(
      `SELECT id, name_ar, name_en, lat, lng, region_id
       FROM cities
       WHERE country_code = 'SA' AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
       LIMIT 200`,
    )
    .bind(lat - delta, lat + delta, lng - delta, lng + delta)
    .all<LocRow>();

  const nearCity = nearest(origin, cityHits ?? [], 80);
  if (!nearCity) return null;

  return {
    place_id: `ksa:city:${nearCity.row.id}`,
    display_name: `${nearCity.row.name_ar}، السعودية`,
    lat,
    lng,
    country_code: "SA",
    region_id: nearCity.row.region_id ?? null,
    city_id: nearCity.row.id,
    district_id: null,
    city_name: nearCity.row.name_ar,
    district_name: null,
    source: "gps",
  };
}
