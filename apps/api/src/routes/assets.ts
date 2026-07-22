import { Hono } from "hono";
import type { AppEnv } from "../lib/http";

export const assetRoutes = new Hono<AppEnv>();

// تقديم أصول الهوية التجارية (شعارات المحلات) من R2 — مسار عام بلا مصادقة.
assetRoutes.get("/:key", async (c) => {
  const key = c.req.param("key");
  const object = await c.env.BRAND_ASSETS.get(key);
  if (!object) return c.json({ error: "الملف غير موجود" }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
});
