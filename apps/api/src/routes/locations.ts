import { Hono } from "hono";
import type { AppEnv } from "../lib/http";
import { distanceKm, parseCoords } from "../lib/ksa-geo";

export const locationRoutes = new Hono<AppEnv>();

locationRoutes.get("/countries", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT code, name_ar, name_en FROM countries ORDER BY name_ar",
  ).all();
  return c.json({ countries: results ?? [] });
});

locationRoutes.get("/regions", async (c) => {
  const country = c.req.query("country") ?? "SA";
  if (country !== "SA") {
    return c.json({ regions: [] });
  }
  const { results } = await c.env.DB.prepare(
    `SELECT id, code, name_ar, name_en, capital_city_id, population, lat, lng
     FROM regions ORDER BY name_ar`,
  ).all();
  return c.json({ regions: results ?? [] });
});

locationRoutes.get("/cities", async (c) => {
  const country = c.req.query("country") ?? "SA";
  const region = c.req.query("region");
  const q = (c.req.query("q") ?? "").trim();
  const origin = parseCoords(c.req.query("lat"), c.req.query("lng"));
  const limit = Math.min(Number(c.req.query("limit") ?? 200), 500);

  const clauses = ["country_code = ?"];
  const binds: unknown[] = [country];
  if (region) {
    clauses.push("region_id = ?");
    binds.push(region);
  }
  if (q) {
    clauses.push("(name_ar LIKE ? OR name_en LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, region_id, name_ar, name_en, lat, lng
     FROM cities
     WHERE ${clauses.join(" AND ")}
     ORDER BY name_ar
     LIMIT ?`,
  )
    .bind(...binds, origin ? 2000 : limit)
    .all<{
      id: string;
      region_id: string | null;
      name_ar: string;
      name_en: string;
      lat: number | null;
      lng: number | null;
    }>();

  let cities = results ?? [];
  if (origin) {
    cities = cities
      .map((city) => ({
        ...city,
        distance_km:
          city.lat != null && city.lng != null
            ? Math.round(
                distanceKm(origin, { lat: city.lat, lng: city.lng }) * 10,
              ) / 10
            : null,
      }))
      .sort((a, b) => {
        if (a.distance_km == null && b.distance_km == null) {
          return a.name_ar.localeCompare(b.name_ar, "ar");
        }
        if (a.distance_km == null) return 1;
        if (b.distance_km == null) return -1;
        return a.distance_km - b.distance_km;
      })
      .slice(0, limit);
  }

  return c.json({ cities });
});

locationRoutes.get("/districts", async (c) => {
  const city = c.req.query("city");
  if (!city) return c.json({ error: "المعامل city مطلوب" }, 400);
  const origin = parseCoords(c.req.query("lat"), c.req.query("lng"));
  const q = (c.req.query("q") ?? "").trim();

  const clauses = ["city_id = ?"];
  const binds: unknown[] = [city];
  if (q) {
    clauses.push("(name_ar LIKE ? OR name_en LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, city_id, region_id, name_ar, name_en, lat, lng
     FROM districts
     WHERE ${clauses.join(" AND ")}
     ORDER BY name_ar`,
  )
    .bind(...binds)
    .all<{
      id: string;
      city_id: string;
      region_id: string | null;
      name_ar: string;
      name_en: string;
      lat: number | null;
      lng: number | null;
    }>();

  let districts = results ?? [];
  if (origin) {
    districts = districts
      .map((d) => ({
        ...d,
        distance_km:
          d.lat != null && d.lng != null
            ? Math.round(distanceKm(origin, { lat: d.lat, lng: d.lng }) * 10) /
              10
            : null,
      }))
      .sort((a, b) => {
        if (a.distance_km == null && b.distance_km == null) {
          return a.name_ar.localeCompare(b.name_ar, "ar");
        }
        if (a.distance_km == null) return 1;
        if (b.distance_km == null) return -1;
        return a.distance_km - b.distance_km;
      });
  }

  return c.json({ districts });
});
