import type { Env } from "../types";
import { dispatchCampaign, priceForAudience } from "../lib/campaigns";
import { debitBalance, ensureShopBalance } from "../lib/billing";
import { generateId } from "../lib/slug";
import { listPastCustomers } from "../lib/visits";

/**
 * Cron: إرسال الحملات المجدولة + التذكيرات الشهرية.
 * يُستدعى من Worker scheduled handler.
 */
export async function runCampaignCron(env: Env): Promise<{
  scheduledDispatched: number;
  remindersCreated: number;
}> {
  const now = Math.floor(Date.now() / 1000);
  let scheduledDispatched = 0;
  let remindersCreated = 0;

  const due = await env.DB.prepare(
    `SELECT id FROM campaigns
     WHERE status = 'scheduled'
       AND (scheduled_at IS NULL OR scheduled_at <= ?)
     ORDER BY created_at ASC
     LIMIT 20`,
  )
    .bind(now)
    .all<{ id: string }>();

  for (const row of due.results ?? []) {
    try {
      await dispatchCampaign(env, row.id);
      scheduledDispatched += 1;
    } catch (err) {
      console.error("cron dispatch failed", row.id, err);
      await env.DB.prepare(
        `UPDATE campaigns SET status = 'failed' WHERE id = ?`,
      )
        .bind(row.id)
        .run();
    }
  }

  // تذكيرات شهرية: محلات Pro مفعّلة، مرة كل ~30 يومًا تقريبًا عبر حصة شهرية.
  const shops = await env.DB.prepare(
    `SELECT id, name, monthly_reminder_quota_used
     FROM shops
     WHERE monthly_reminders_enabled = 1
       AND subscription_tier = 'pro'
       AND subscription_status IN ('active', 'trial')
       AND suspended_at IS NULL
     LIMIT 50`,
  ).all<{
    id: string;
    name: string;
    monthly_reminder_quota_used: number;
  }>();

  const message =
    "مرحباً {اسم} 👋\nاشتقنا لزيارتك في {اسم_المحل}!\nنتطلع لرؤيتك قريباً 🌟";

  for (const shop of shops.results ?? []) {
    const used = shop.monthly_reminder_quota_used ?? 0;
    if (used >= 400) continue;

    // تجنب إنشاء تذكير مكرر خلال آخر 25 يومًا
    const recent = await env.DB.prepare(
      `SELECT id FROM campaigns
       WHERE shop_id = ? AND type = 'reminder'
         AND created_at > ?
       LIMIT 1`,
    )
      .bind(shop.id, now - 25 * 86400)
      .first();
    if (recent) continue;

    const audience = await listPastCustomers(env.DB, shop.id, {
      daysSinceLastVisit: 30,
      limit: Math.min(400 - used, 200),
    });
    if (audience.length === 0) continue;

    const price = priceForAudience("past_customers");
    const withinQuota = Math.min(audience.length, 400 - used);
    const overQuota = Math.max(0, audience.length - withinQuota);
    const cost = Math.round(overQuota * price * 100) / 100;

    if (cost > 0) {
      await ensureShopBalance(env.DB, shop.id);
      const debit = await debitBalance(env.DB, shop.id, cost);
      if (!debit.ok) {
        // اكتفِ بالحصة المجانية فقط
      }
    }

    const campaignId = generateId("cmp");
    await env.DB.prepare(
      `INSERT INTO campaigns (
         id, shop_id, name, audience_type, type, status, targeting, message,
         audience_count, price_per_message, cost, scheduled_at
       ) VALUES (?, ?, ?, 'past_customers', 'reminder', 'scheduled', ?, ?, ?, ?, ?, NULL)`,
    )
      .bind(
        campaignId,
        shop.id,
        `تذكير شهري — ${shop.name}`,
        JSON.stringify({ days_since_last_visit: 30 }),
        message,
        audience.length,
        price,
        cost,
      )
      .run();

    await env.DB.prepare(
      `UPDATE shops
       SET monthly_reminder_quota_used = monthly_reminder_quota_used + ?
       WHERE id = ?`,
    )
      .bind(Math.min(audience.length, 400 - used), shop.id)
      .run();

    try {
      await dispatchCampaign(env, campaignId);
      remindersCreated += 1;
    } catch (err) {
      console.error("reminder dispatch failed", campaignId, err);
    }
  }

  return { scheduledDispatched, remindersCreated };
}
