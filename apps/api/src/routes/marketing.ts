import { Hono } from "hono";
import type { AppEnv } from "../lib/http";
import { isValidSaudiPhone, requireFields } from "../lib/http";

export const marketingRoutes = new Hono<AppEnv>();

marketingRoutes.get("/unsubscribe/:token", async (c) => {
  const token = c.req.param("token");
  const customer = await c.env.DB.prepare(
    `SELECT phone, name, marketing_consent, marketing_opted_out_at
     FROM customers WHERE unsubscribe_token = ?`,
  )
    .bind(token)
    .first<{
      phone: string;
      name: string | null;
      marketing_consent: number;
      marketing_opted_out_at: number | null;
    }>();

  if (!customer) return c.json({ error: "الرابط غير صالح" }, 404);

  return c.json({
    name: customer.name,
    opted_out: customer.marketing_opted_out_at != null,
    marketing_consent: customer.marketing_consent === 1,
  });
});

marketingRoutes.post("/unsubscribe/:token", async (c) => {
  const token = c.req.param("token");
  const customer = await c.env.DB.prepare(
    `SELECT phone FROM customers WHERE unsubscribe_token = ?`,
  )
    .bind(token)
    .first<{ phone: string }>();
  if (!customer) return c.json({ error: "الرابط غير صالح" }, 404);

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `UPDATE customers
     SET marketing_consent = 0, marketing_opted_out_at = ?
     WHERE phone = ?`,
  )
    .bind(now, customer.phone)
    .run();

  return c.json({ ok: true, opted_out: true });
});

marketingRoutes.post("/marketing/opt-out", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const err = requireFields(body, ["phone"]);
  if (err) return c.json({ error: err }, 400);
  const phone = String(body.phone).trim();
  if (!isValidSaudiPhone(phone)) {
    return c.json({ error: "رقم الجوال غير صالح" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const result = await c.env.DB.prepare(
    `UPDATE customers
     SET marketing_consent = 0, marketing_opted_out_at = ?
     WHERE phone = ?`,
  )
    .bind(now, phone)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    return c.json({ error: "لم يُعثر على العميل" }, 404);
  }
  return c.json({ ok: true });
});

/** حق الحذف الكامل (PDPL) عبر رمز إلغاء الاشتراك. */
marketingRoutes.delete("/unsubscribe/:token/data", async (c) => {
  const token = c.req.param("token");
  const customer = await c.env.DB.prepare(
    `SELECT phone FROM customers WHERE unsubscribe_token = ?`,
  )
    .bind(token)
    .first<{ phone: string }>();
  if (!customer) return c.json({ error: "الرابط غير صالح" }, 404);

  const phone = customer.phone;
  await c.env.DB.prepare(`DELETE FROM customer_shop_visits WHERE phone = ?`)
    .bind(phone)
    .run();
  await c.env.DB.prepare(`DELETE FROM queue_entries WHERE phone = ?`)
    .bind(phone)
    .run();
  await c.env.DB.prepare(`DELETE FROM customers WHERE phone = ?`)
    .bind(phone)
    .run();

  return c.json({ ok: true, deleted: true });
});
