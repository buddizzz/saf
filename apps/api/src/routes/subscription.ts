import { Hono } from "hono";
import type { AppEnv } from "../lib/http";
import { generateId } from "../lib/slug";
import {
  isPro,
  periodEndForPlan,
  trialEndsAt,
  type SubscriptionPlan,
} from "../lib/subscription";
import { requireAuth } from "../middleware/auth";

export const subscriptionRoutes = new Hono<AppEnv>();

type ShopRow = {
  id: string;
  owner_id: string;
  subscription_tier: string;
  subscription_status: string;
  subscription_renews_at: number | null;
  monthly_reminder_quota_used: number | null;
  hide_powered_by: number | null;
};

async function ownedShop(
  db: D1Database,
  shopId: string,
  ownerId: string,
): Promise<ShopRow | null> {
  return db
    .prepare(
      `SELECT id, owner_id, subscription_tier, subscription_status,
              subscription_renews_at, monthly_reminder_quota_used, hide_powered_by
       FROM shops WHERE id = ? AND owner_id = ?`,
    )
    .bind(shopId, ownerId)
    .first<ShopRow>();
}

subscriptionRoutes.get("/:id/subscription", requireAuth, async (c) => {
  const auth = c.get("auth");
  const shop = await ownedShop(c.env.DB, c.req.param("id"), auth.sub);
  if (!shop) return c.json({ error: "المحل غير موجود" }, 404);

  const sub = await c.env.DB.prepare(
    `SELECT id, plan, status, provider, current_period_end, cancel_at_period_end, created_at
     FROM subscriptions WHERE shop_id = ? ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(shop.id)
    .first();

  return c.json({
    shop: {
      id: shop.id,
      subscription_tier: shop.subscription_tier,
      subscription_status: shop.subscription_status,
      subscription_renews_at: shop.subscription_renews_at,
      monthly_reminder_quota_used: shop.monthly_reminder_quota_used ?? 0,
      hide_powered_by: shop.hide_powered_by ?? 0,
      is_pro: isPro(shop),
    },
    subscription: sub,
    pricing: {
      monthly_sar: 89,
      yearly_sar: 828,
      trial_days: 14,
      reminder_quota: 400,
    },
  });
});

// بدء تجربة Pro أو تفعيل يدوي (MVP بدون بوابة دفع بعد).
subscriptionRoutes.post("/:id/subscription", requireAuth, async (c) => {
  const auth = c.get("auth");
  const shop = await ownedShop(c.env.DB, c.req.param("id"), auth.sub);
  if (!shop) return c.json({ error: "المحل غير موجود" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const plan = body.plan as SubscriptionPlan;
  if (plan !== "pro_monthly" && plan !== "pro_yearly") {
    return c.json({ error: "الخطة غير صالحة (pro_monthly | pro_yearly)" }, 400);
  }

  const mode = body.mode === "activate" ? "activate" : "trial";
  if (isPro(shop) && shop.subscription_status !== "cancelled") {
    return c.json({ error: "المحل مشترك بالفعل في Pro" }, 409);
  }

  // تجربة واحدة فقط لكل محل.
  if (mode === "trial") {
    const priorTrial = await c.env.DB.prepare(
      `SELECT id FROM subscriptions WHERE shop_id = ? AND provider = 'trial' LIMIT 1`,
    )
      .bind(shop.id)
      .first();
    if (priorTrial) {
      return c.json(
        { error: "تم استخدام التجربة المجانية مسبقًا — فعّل الاشتراك المدفوع" },
        409,
      );
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const periodEnd = mode === "trial" ? trialEndsAt(now) : periodEndForPlan(plan, now);
  const status = mode === "trial" ? "trial" : "active";
  const provider = mode === "trial" ? "trial" : "manual";
  const subId = generateId("sub");

  await c.env.DB.prepare(
    `INSERT INTO subscriptions
      (id, shop_id, plan, status, provider, current_period_end, cancel_at_period_end)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
  )
    .bind(subId, shop.id, plan, status, provider, periodEnd)
    .run();

  await c.env.DB.prepare(
    `UPDATE shops SET
       subscription_tier = 'pro',
       subscription_status = ?,
       subscription_renews_at = ?
     WHERE id = ?`,
  )
    .bind(status, periodEnd, shop.id)
    .run();

  const updated = await ownedShop(c.env.DB, shop.id, auth.sub);
  return c.json(
    {
      shop: {
        ...updated,
        is_pro: updated ? isPro(updated) : true,
      },
      subscription: {
        id: subId,
        plan,
        status,
        provider,
        current_period_end: periodEnd,
      },
    },
    201,
  );
});

subscriptionRoutes.post("/:id/subscription/cancel", requireAuth, async (c) => {
  const auth = c.get("auth");
  const shop = await ownedShop(c.env.DB, c.req.param("id"), auth.sub);
  if (!shop) return c.json({ error: "المحل غير موجود" }, 404);
  if (!isPro(shop)) {
    return c.json({ error: "لا يوجد اشتراك نشط للإلغاء" }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  void body;

  const sub = await c.env.DB.prepare(
    `SELECT id, current_period_end FROM subscriptions
     WHERE shop_id = ? AND status IN ('active','trial')
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(shop.id)
    .first<{ id: string; current_period_end: number }>();

  if (!sub) return c.json({ error: "لا يوجد اشتراك نشط" }, 400);

  await c.env.DB.prepare(
    `UPDATE subscriptions SET status = 'cancelled', cancel_at_period_end = 1 WHERE id = ?`,
  )
    .bind(sub.id)
    .run();

  await c.env.DB.prepare(
    `UPDATE shops SET subscription_status = 'cancelled' WHERE id = ?`,
  )
    .bind(shop.id)
    .run();

  return c.json({
    ok: true,
    access_until: sub.current_period_end,
    message: "سيستمر الوصول لـ Pro حتى نهاية الفترة المدفوعة",
  });
});
