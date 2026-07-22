import { Hono } from "hono";
import type { AppEnv } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { creditBalance, ensureShopBalance } from "../lib/billing";

export const billingRoutes = new Hono<AppEnv>();

async function ownedShopId(
  c: {
    env: { DB: D1Database };
    get: (k: "auth") => { sub: string };
  },
  shopId: string,
): Promise<string | null> {
  const shop = await c.env.DB.prepare(
    `SELECT id FROM shops WHERE id = ? AND owner_id = ?`,
  )
    .bind(shopId, c.get("auth").sub)
    .first<{ id: string }>();
  return shop?.id ?? null;
}

billingRoutes.get("/:shopId/billing/balance", requireAuth, async (c) => {
  const shopId = await ownedShopId(c, c.req.param("shopId"));
  if (!shopId) return c.json({ error: "غير مصرّح" }, 403);
  const bal = await ensureShopBalance(c.env.DB, shopId);
  return c.json({
    balance: bal.balance,
    auto_topup_enabled: bal.auto_topup_enabled === 1,
    auto_topup_threshold: bal.auto_topup_threshold,
    auto_topup_amount: bal.auto_topup_amount,
    currency: "SAR",
  });
});

billingRoutes.get("/:shopId/billing/history", requireAuth, async (c) => {
  const shopId = await ownedShopId(c, c.req.param("shopId"));
  if (!shopId) return c.json({ error: "غير مصرّح" }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT id, amount, bonus_amount, provider, status, note, created_at
     FROM payments WHERE shop_id = ?
     ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(shopId)
    .all();
  return c.json({ payments: results ?? [] });
});

/**
 * شحن الرصيد عبر بوابة الدفع — مؤجّل عمدًا (آخر ميزة).
 * الواجهة تستدعيه وتُظهر رسالة "قريبًا".
 */
billingRoutes.post("/:shopId/billing/topup", requireAuth, async (c) => {
  const shopId = await ownedShopId(c, c.req.param("shopId"));
  if (!shopId) return c.json({ error: "غير مصرّح" }, 403);

  return c.json(
    {
      error: "بوابة الدفع غير مفعّلة بعد",
      code: "PAYMENT_GATEWAY_PENDING",
      message:
        "شحن الرصيد عبر مدى / Apple Pay / STC Pay سيُفعَّل لاحقًا. حاليًا يمكن شحن الرصيد يدويًا من لوحة المنصة.",
      presets: [100, 300, 1000],
    },
    501,
  );
});

billingRoutes.post(
  "/:shopId/billing/auto-topup",
  requireAuth,
  async (c) => {
    const shopId = await ownedShopId(c, c.req.param("shopId"));
    if (!shopId) return c.json({ error: "غير مصرّح" }, 403);

    // حفظ التفضيل فقط — التنفيذ الفعلي يعتمد على بوابة الدفع لاحقًا.
    const body = await c.req.json().catch(() => ({}));
    await ensureShopBalance(c.env.DB, shopId);
    await c.env.DB.prepare(
      `UPDATE shop_balance
       SET auto_topup_enabled = ?,
           auto_topup_threshold = ?,
           auto_topup_amount = ?,
           updated_at = unixepoch()
       WHERE shop_id = ?`,
    )
      .bind(
        body.enabled ? 1 : 0,
        Number(body.threshold ?? 50),
        Number(body.amount ?? 300),
        shopId,
      )
      .run();

    return c.json({
      ok: true,
      payment_gateway_pending: true,
      note: "التفضيل محفوظ؛ التنفيذ التلقائي ينتظر بوابة الدفع",
    });
  },
);

/** رصيد تجريبي للتطوير فقط (بيئة development). */
billingRoutes.post(
  "/:shopId/billing/dev-credit",
  requireAuth,
  async (c) => {
    if (c.env.ENVIRONMENT === "production") {
      return c.json({ error: "غير متاح" }, 404);
    }
    const shopId = await ownedShopId(c, c.req.param("shopId"));
    if (!shopId) return c.json({ error: "غير مصرّح" }, 403);
    const body = await c.req.json().catch(() => ({}));
    const amount = Number(body.amount ?? 100);
    if (!(amount > 0) || amount > 5000) {
      return c.json({ error: "مبلغ غير صالح" }, 400);
    }
    const result = await creditBalance(c.env.DB, shopId, amount, {
      provider: "manual",
      note: "dev credit",
      applyVolumeBonus: true,
    });
    return c.json(result);
  },
);
