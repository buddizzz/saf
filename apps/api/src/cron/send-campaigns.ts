import type { Env } from "../types";
import { dispatchCampaign } from "../lib/campaigns";
import { runCustomerAutomations } from "../lib/automations";

/**
 * Cron: إرسال الحملات المجدولة + أتمتة تسويق المحلات لعملائها
 * (استرجاع الغائبين / كبار العملاء / التوصيات — مرحلة «بعد الشراء»
 * من خطة التسويق من صفحة واحدة). يُستدعى من Worker scheduled handler.
 */
export async function runCampaignCron(env: Env): Promise<{
  scheduledDispatched: number;
  automationCampaigns: number;
}> {
  const now = Math.floor(Date.now() / 1000);
  let scheduledDispatched = 0;

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

  // أتمتة العملاء (winback / vip / referral) — تُنشأ كحملات مجدولة وتُرسل فورًا
  const { campaignsCreated } = await runCustomerAutomations(env);
  for (const campaignId of campaignsCreated) {
    try {
      await dispatchCampaign(env, campaignId);
    } catch (err) {
      console.error("automation dispatch failed", campaignId, err);
    }
  }

  return {
    scheduledDispatched,
    automationCampaigns: campaignsCreated.length,
  };
}
