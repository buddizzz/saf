import { Hono } from "hono";
import type { AppEnv } from "../lib/http";

export const locationRoutes = new Hono<AppEnv>();

locationRoutes.get("/countries", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT code, name_ar, name_en FROM countries ORDER BY name_ar",
  ).all();
  return c.json({ countries: results ?? [] });
});

locationRoutes.get("/cities", async (c) => {
  const country = c.req.query("country");
  if (!country) return c.json({ error: "المعامل country مطلوب" }, 400);
  const { results } = await c.env.DB.prepare(
    "SELECT id, name_ar, name_en FROM cities WHERE country_code = ? ORDER BY name_ar",
  )
    .bind(country)
    .all();
  return c.json({ cities: results ?? [] });
});

locationRoutes.get("/districts", async (c) => {
  const city = c.req.query("city");
  if (!city) return c.json({ error: "المعامل city مطلوب" }, 400);
  const { results } = await c.env.DB.prepare(
    "SELECT id, name_ar, name_en FROM districts WHERE city_id = ? ORDER BY name_ar",
  )
    .bind(city)
    .all();
  return c.json({ districts: results ?? [] });
});
