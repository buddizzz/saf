// تكامل OpenStreetMap Nominatim (بحث عكسي وجغرافي) لإثراء lat/lng للمحلات.
// سياسة الاستخدام: User-Agent مُعرّف + طلب واحد لكل عملية إنشاء/تحديث موقع.

const NOMINATIM = "https://nominatim.openstreetmap.org";
const USER_AGENT = "SafQueue/0.1 (https://safapp.net; geo@safapp.net)";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface OsmPlace {
  place_id: string;
  display_name: string;
  lat: number;
  lng: number;
  country_code?: string | null;
  city_name?: string | null;
  district_name?: string | null;
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

async function nominatimGet(path: string): Promise<unknown> {
  const res = await fetch(`${NOMINATIM}${path}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`Nominatim ${res.status}`);
  }
  return res.json();
}

function pickAddressName(
  address: Record<string, string> | undefined,
  keys: string[],
): string | null {
  if (!address) return null;
  for (const key of keys) {
    if (address[key]) return address[key];
  }
  return null;
}

function mapResult(row: {
  place_id?: number | string;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
}): OsmPlace | null {
  const coords = parseCoords(row.lat, row.lon);
  if (!coords || !row.display_name) return null;
  return {
    place_id: String(row.place_id ?? ""),
    display_name: row.display_name,
    lat: coords.lat,
    lng: coords.lng,
    country_code: row.address?.country_code?.toUpperCase() ?? null,
    city_name: pickAddressName(row.address, [
      "city",
      "town",
      "municipality",
      "village",
      "state",
    ]),
    district_name: pickAddressName(row.address, [
      "suburb",
      "neighbourhood",
      "quarter",
      "city_district",
      "district",
    ]),
  };
}

/** عكس الإحداثيات → عنوان OSM (مدينة/حي تقريبي). */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<OsmPlace | null> {
  try {
    const data = (await nominatimGet(
      `/reverse?format=jsonv2&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&accept-language=ar,en`,
    )) as {
      place_id?: number;
      display_name?: string;
      lat?: string;
      lon?: string;
      address?: Record<string, string>;
    };
    return mapResult(data);
  } catch (err) {
    console.warn("OSM reverse geocode failed:", err);
    return null;
  }
}

/** بحث بالعنوان النصي (دولة/مدينة/حي) → إحداثيات تقريبية. */
export async function geocodeAddress(parts: {
  country?: string | null;
  city?: string | null;
  district?: string | null;
  freeDistrict?: string | null;
}): Promise<OsmPlace | null> {
  const q = [parts.district || parts.freeDistrict, parts.city, parts.country]
    .filter(Boolean)
    .join(", ");
  if (!q) return null;
  try {
    const data = (await nominatimGet(
      `/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}&accept-language=ar,en`,
    )) as Array<{
      place_id?: number;
      display_name?: string;
      lat?: string;
      lon?: string;
      address?: Record<string, string>;
    }>;
    if (!Array.isArray(data) || data.length === 0) return null;
    return mapResult(data[0]);
  } catch (err) {
    console.warn("OSM geocode failed:", err);
    return null;
  }
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
