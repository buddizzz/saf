import { Hono } from "hono";
import type { AppEnv } from "../lib/http";
import { requireFields } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { generateId } from "../lib/slug";
import {
  assertProShop,
  CAMPAIGN_PRICES,
  dispatchCampaign,
  estimateAudience,
  needsManualModeration,
  priceForAudience,
  type AudienceType,
  type TargetingJson,
} from "../lib/campaigns";
import { debitBalance, ensureShopBalance } from "../lib/billing";

export const campaignRoutes = new Hono<AppEnv>();

async function loadOwnedShop(c: {
  env: { DB: D1Database };
  get: (k: "auth") => { sub: string };
}, shopId: string) {
  return c.env.DB.prepare(
    `SELECT id, owner_id, name, subscription_tier, subscription_status,
            subscription_renews_at, suspended_at, monthly_reminders_enabled,
            monthly_reminder_quota_used, city_id, district_id
     FROM shops WHERE id = ? AND owner_id = ?`,
  )
    .bind(shopId, c.get("auth").sub)
    .first<{
      id: string;
      owner_id: string;
      name: string;
      subscription_tier: string;
      subscription_status: string;
      subscription_renews_at: number | null;
      suspended_at: number | null;
      monthly_reminders_enabled: number;
      monthly_reminder_quota_used: number;
      city_id: string | null;
      district_id: string | null;
    }>();
}

function parseTargeting(body: Record<string, unknown>): TargetingJson {
  return {
    city_id: (body.city_id as string) || null,
    district_id: (body.district_id as string) || null,
    gender: (body.gender as string) || null,
    age_category: (body.age_category as string) || null,
    exclude_existing: body.exclude_existing !== false,
    days_since_last_visit:
      body.days_since_last_visit != null
        ? Number(body.days_since_last_visit)
        : null,
  };
}

campaignRoutes.get("/:shopId/campaigns", requireAuth, async (c) => {
  const shop = await loadOwnedShop(c, c.req.param("shopId"));
  if (!shop) return c.json({ error: "غير مصرّح" }, 403);

  const { results } = await c.env.DB.prepare(
    `SELECT id, name, audience_type, type, status, audience_count,
            price_per_message, cost, scheduled_at, sent_at, rejection_reason, created_at
     FROM campaigns WHERE shop_id = ?
     ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(shop.id)
    .all();

  return c.json({ campaigns: results ?? [], prices: CAMPAIGN_PRICES });
});

campaignRoutes.post(
  "/:shopId/campaigns/audience/estimate",
  requireAuth,
  async (c) => {
    const shop = await loadOwnedShop(c, c.req.param("shopId"));
    if (!shop) return c.json({ error: "غير مصرّح" }, 403);
    const proErr = await assertProShop(shop);
    if (proErr) return c.json({ error: proErr }, 403);

    const body = await c.req.json().catch(() => ({}));
    const audienceType = body.audience_type as AudienceType;
    if (audienceType !== "past_customers" && audienceType !== "new_in_area") {
      return c.json({ error: "نوع الجمهور غير صالح" }, 400);
    }

    const targeting = parseTargeting(body);
    if (audienceType === "new_in_area") {
      targeting.city_id = targeting.city_id || shop.city_id;
      targeting.district_id = targeting.district_id || shop.district_id;
      if (!targeting.city_id && !targeting.district_id) {
        return c.json({ error: "حدد مدينة أو حيًا للجمهور الجديد" }, 400);
      }
    }

    const estimate = await estimateAudience(
      c.env.DB,
      shop.id,
      audienceType,
      targeting,
    );
    const price = priceForAudience(audienceType);
    return c.json({
      type: audienceType,
      count: estimate.count,
      price_per_message: price,
      estimated_cost: Math.round(estimate.count * price * 100) / 100,
      customers: estimate.customers.map((row) => ({
        name: row.name ?? null,
        gender: row.gender ?? null,
        age_category: row.age_category ?? null,
        visit_count: row.visit_count ?? null,
        last_visit_at: row.last_visit_at ?? null,
      })),
    });
  },
);

campaignRoutes.post("/:shopId/campaigns", requireAuth, async (c) => {
  const shop = await loadOwnedShop(c, c.req.param("shopId"));
  if (!shop) return c.json({ error: "غير مصرّح" }, 403);
  const proErr = await assertProShop(shop);
  if (proErr) return c.json({ error: proErr }, 403);

  const body = await c.req.json().catch(() => ({}));
  const err = requireFields(body, ["name", "audience_type", "message"]);
  if (err) return c.json({ error: err }, 400);

  const audienceType = body.audience_type as AudienceType;
  if (audienceType !== "past_customers" && audienceType !== "new_in_area") {
    return c.json({ error: "نوع الجمهور غير صالح" }, 400);
  }

  const message = String(body.message).trim();
  if (message.length < 5 || message.length > 1000) {
    return c.json({ error: "طول الرسالة يجب أن يكون بين 5 و 1000 حرف" }, 400);
  }

  const targeting = parseTargeting(body);
  if (audienceType === "new_in_area") {
    targeting.city_id = targeting.city_id || shop.city_id;
    targeting.district_id = targeting.district_id || shop.district_id;
    if (!targeting.city_id && !targeting.district_id) {
      return c.json({ error: "حدد مدينة أو حيًا للجمهور الجديد" }, 400);
    }
  }

  const estimate = await estimateAudience(
    c.env.DB,
    shop.id,
    audienceType,
    targeting,
  );
  if (estimate.count < 1) {
    return c.json({ error: "لا يوجد جمهور مطابق للفلاتر" }, 400);
  }

  const price = priceForAudience(audienceType);
  const cost = Math.round(estimate.count * price * 100) / 100;
  const id = generateId("cmp");

  await c.env.DB.prepare(
    `INSERT INTO campaigns (
       id, shop_id, name, audience_type, type, status, targeting, message,
       audience_count, price_per_message, cost, scheduled_at
     ) VALUES (?, ?, ?, ?, 'whatsapp', 'draft', ?, ?, ?, ?, ?, NULL)`,
  )
    .bind(
      id,
      shop.id,
      String(body.name).trim(),
      audienceType,
      JSON.stringify(targeting),
      message,
      estimate.count,
      price,
      cost,
    )
    .run();

  const campaign = await c.env.DB.prepare(
    `SELECT * FROM campaigns WHERE id = ?`,
  )
    .bind(id)
    .first();

  return c.json({ campaign }, 201);
});

campaignRoutes.post(
  "/:shopId/campaigns/reminders/toggle",
  requireAuth,
  async (c) => {
    const shop = await loadOwnedShop(c, c.req.param("shopId"));
    if (!shop) return c.json({ error: "غير مصرّح" }, 403);
    const proErr = await assertProShop(shop);
    if (proErr) return c.json({ error: proErr }, 403);

    const body = await c.req.json().catch(() => ({}));
    const enabled = body.enabled === true || body.enabled === 1;
    await c.env.DB.prepare(
      `UPDATE shops SET monthly_reminders_enabled = ? WHERE id = ?`,
    )
      .bind(enabled ? 1 : 0, shop.id)
      .run();

    return c.json({
      monthly_reminders_enabled: enabled,
      reminder_quota: 400,
      reminder_quota_used: shop.monthly_reminder_quota_used ?? 0,
    });
  },
);

campaignRoutes.get(
  "/:shopId/campaigns/reminders",
  requireAuth,
  async (c) => {
    const shop = await loadOwnedShop(c, c.req.param("shopId"));
    if (!shop) return c.json({ error: "غير مصرّح" }, 403);
    return c.json({
      monthly_reminders_enabled: shop.monthly_reminders_enabled === 1,
      reminder_quota: 400,
      reminder_quota_used: shop.monthly_reminder_quota_used ?? 0,
      price_per_message: CAMPAIGN_PRICES.past_customers,
    });
  },
);

campaignRoutes.get(
  "/:shopId/campaigns/:id",
  requireAuth,
  async (c) => {
    const shop = await loadOwnedShop(c, c.req.param("shopId"));
    if (!shop) return c.json({ error: "غير مصرّح" }, 403);

    const campaign = await c.env.DB.prepare(
      `SELECT * FROM campaigns WHERE id = ? AND shop_id = ?`,
    )
      .bind(c.req.param("id"), shop.id)
      .first();
    if (!campaign) return c.json({ error: "الحملة غير موجودة" }, 404);

    const stats = await c.env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
         COUNT(*) AS total
       FROM campaign_messages WHERE campaign_id = ?`,
    )
      .bind(c.req.param("id"))
      .first();

    return c.json({ campaign, stats });
  },
);

campaignRoutes.delete(
  "/:shopId/campaigns/:id",
  requireAuth,
  async (c) => {
    const shop = await loadOwnedShop(c, c.req.param("shopId"));
    if (!shop) return c.json({ error: "غير مصرّح" }, 403);

    const campaign = await c.env.DB.prepare(
      `SELECT id, status FROM campaigns WHERE id = ? AND shop_id = ?`,
    )
      .bind(c.req.param("id"), shop.id)
      .first<{ id: string; status: string }>();
    if (!campaign) return c.json({ error: "الحملة غير موجودة" }, 404);
    if (!["draft", "scheduled", "pending_review"].includes(campaign.status)) {
      return c.json({ error: "لا يمكن إلغاء حملة جارية أو مكتملة" }, 400);
    }

    await c.env.DB.prepare(
      `UPDATE campaigns SET status = 'cancelled' WHERE id = ?`,
    )
      .bind(campaign.id)
      .run();
    return c.json({ ok: true });
  },
);

campaignRoutes.post(
  "/:shopId/campaigns/:id/send",
  requireAuth,
  async (c) => {
    const shop = await loadOwnedShop(c, c.req.param("shopId"));
    if (!shop) return c.json({ error: "غير مصرّح" }, 403);
    const proErr = await assertProShop(shop);
    if (proErr) return c.json({ error: proErr }, 403);

    const body = await c.req.json().catch(() => ({}));
    const campaign = await c.env.DB.prepare(
      `SELECT * FROM campaigns WHERE id = ? AND shop_id = ?`,
    )
      .bind(c.req.param("id"), shop.id)
      .first<{
        id: string;
        status: string;
        audience_type: AudienceType;
        audience_count: number;
        cost: number;
        message: string;
        targeting: string;
      }>();
    if (!campaign) return c.json({ error: "الحملة غير موجودة" }, 404);
    if (campaign.status !== "draft" && campaign.status !== "rejected") {
      return c.json({ error: "الحملة ليست جاهزة للإرسال" }, 400);
    }

    // إعادة تقدير التكلفة قبل الخصم
    const targeting = JSON.parse(campaign.targeting) as TargetingJson;
    const estimate = await estimateAudience(
      c.env.DB,
      shop.id,
      campaign.audience_type,
      targeting,
    );
    const price = priceForAudience(campaign.audience_type);
    const cost = Math.round(estimate.count * price * 100) / 100;
    if (estimate.count < 1) {
      return c.json({ error: "لا يوجد جمهور مطابق" }, 400);
    }

    await ensureShopBalance(c.env.DB, shop.id);
    const debit = await debitBalance(c.env.DB, shop.id, cost);
    if (!debit.ok) {
      return c.json(
        {
          error: "الرصيد غير كافٍ",
          balance: debit.balance,
          required: cost,
          payment_required: true,
          // بوابة الدفع لاحقًا — الشحن حاليًا عبر الأدمن
          topup_hint: "اطلب شحن الرصيد من دعم المنصة (بوابة الدفع قريبًا)",
        },
        402,
      );
    }

    const mod = await needsManualModeration(
      c.env.DB,
      campaign.audience_type,
      estimate.count,
      campaign.message,
    );

    const scheduledAt =
      body.scheduled_at != null ? Number(body.scheduled_at) : null;
    const now = Math.floor(Date.now() / 1000);

    if (mod.needsReview) {
      await c.env.DB.prepare(
        `UPDATE campaigns
         SET status = 'pending_review', audience_count = ?, cost = ?,
             price_per_message = ?, scheduled_at = ?
         WHERE id = ?`,
      )
        .bind(
          estimate.count,
          cost,
          price,
          scheduledAt && scheduledAt > now ? scheduledAt : null,
          campaign.id,
        )
        .run();

      return c.json({
        status: "pending_review",
        reasons: mod.reasons,
        balance: debit.balance,
        message: "الحملة بانتظار مراجعة المنصة قبل الإرسال",
      });
    }

    if (scheduledAt && scheduledAt > now) {
      await c.env.DB.prepare(
        `UPDATE campaigns
         SET status = 'scheduled', audience_count = ?, cost = ?,
             price_per_message = ?, scheduled_at = ?
         WHERE id = ?`,
      )
        .bind(estimate.count, cost, price, scheduledAt, campaign.id)
        .run();
      return c.json({
        status: "scheduled",
        scheduled_at: scheduledAt,
        balance: debit.balance,
      });
    }

    await c.env.DB.prepare(
      `UPDATE campaigns
       SET status = 'scheduled', audience_count = ?, cost = ?,
           price_per_message = ?, scheduled_at = NULL
       WHERE id = ?`,
    )
      .bind(estimate.count, cost, price, campaign.id)
      .run();

    const result = await dispatchCampaign(c.env, campaign.id);
    const bal = await ensureShopBalance(c.env.DB, shop.id);
    return c.json({ status: "completed", ...result, balance: bal.balance });
  },
);
