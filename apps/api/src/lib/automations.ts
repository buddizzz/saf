/**
 * أتمتة التسويق — مستوحاة من «خطة التسويق من صفحة واحدة» (The 1-Page Marketing Plan):
 *
 * 1) أتمتة المحل → عملاؤه (مرحلة «بعد الشراء»: عملاء دائمون، رفع القيمة، توصيات):
 *    - winback: استرجاع العميل الغائب بعد N يوم.
 *    - vip: مكافأة كبار العملاء (زيارات متكررة) شهريًا.
 *    - referral: طلب توصية من العملاء الراضين (تقييم 4+) أسبوعيًا.
 *
 * 2) أتمتة المنصة → أصحاب المحلات (تجديد الاشتراكات + إعادة التفعيل):
 *    - trial_ending / renewal_due / subscription_expired / offline_week
 *    (انظر cron/lifecycle.ts) — تُسجَّل في shop_notifications وتُرسل واتساب.
 */

import { generateId } from "./slug";
import { listPastCustomers, type AudienceFilters } from "./visits";
import { priceForAudience } from "./campaigns";
import { debitBalance, ensureShopBalance } from "./billing";
import { sendWhatsAppMessage, type WhatsAppEnv } from "./whatsapp";
import { PRICING } from "./subscription";

export type AutomationKind = "winback" | "vip" | "referral";

export interface AutomationConfig {
  /** winback: أيام الغياب قبل الرسالة */
  days?: number;
  /** vip: حد الزيارات الأدنى */
  min_visits?: number;
  /** نص الرسالة (يدعم {اسم} و{اسم_المحل}) */
  message?: string;
}

export const AUTOMATION_DEFAULTS: Record<
  AutomationKind,
  Required<Pick<AutomationConfig, "message">> & AutomationConfig
> = {
  winback: {
    days: 30,
    message:
      "مرحباً {اسم} 👋\nاشتقنا لزيارتك في {اسم_المحل}!\nنتطلع لرؤيتك قريباً 🌟",
  },
  vip: {
    min_visits: 3,
    message:
      "مرحباً {اسم} 🌟\nأنت من عملائنا المميزين في {اسم_المحل} — تنتظرك معاملة خاصة في زيارتك القادمة!",
  },
  referral: {
    message:
      "مرحباً {اسم} 👋\nسعدنا برأيك في {اسم_المحل}! شارك تجربتك مع أصدقائك وأحضرهم معك في زيارتك القادمة 🤝",
  },
};

/** كل كم يومًا يُعاد تشغيل الأتمتة لنفس المحل (منع التكرار). */
export const AUTOMATION_INTERVAL_DAYS: Record<AutomationKind, number> = {
  winback: 25,
  vip: 30,
  referral: 7,
};

export interface AutomationRow {
  automation: AutomationKind;
  enabled: boolean;
  config: AutomationConfig;
}

export async function getShopAutomations(
  db: D1Database,
  shopId: string,
): Promise<AutomationRow[]> {
  const { results } = await db
    .prepare(
      `SELECT automation, enabled, config FROM shop_automations WHERE shop_id = ?`,
    )
    .bind(shopId)
    .all<{ automation: AutomationKind; enabled: number; config: string | null }>();

  const stored = new Map(
    (results ?? []).map((r) => [
      r.automation,
      {
        automation: r.automation,
        enabled: r.enabled === 1,
        config: safeParseConfig(r.config),
      },
    ]),
  );

  return (Object.keys(AUTOMATION_DEFAULTS) as AutomationKind[]).map(
    (kind) =>
      stored.get(kind) ?? { automation: kind, enabled: false, config: {} },
  );
}

export async function upsertShopAutomation(
  db: D1Database,
  shopId: string,
  kind: AutomationKind,
  enabled: boolean,
  config: AutomationConfig,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO shop_automations (shop_id, automation, enabled, config, updated_at)
       VALUES (?, ?, ?, ?, unixepoch())
       ON CONFLICT(shop_id, automation) DO UPDATE SET
         enabled = excluded.enabled,
         config = excluded.config,
         updated_at = unixepoch()`,
    )
    .bind(shopId, kind, enabled ? 1 : 0, JSON.stringify(config))
    .run();
}

function safeParseConfig(raw: string | null): AutomationConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as AutomationConfig;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

interface AutomationShopRow {
  id: string;
  name: string;
  monthly_reminder_quota_used: number;
  monthly_reminders_enabled: number;
}

/**
 * يشغّل أتمتة تسويق المحلات لعملائها (Pro فقط): ينشئ حملة type='reminder'
 * موسومة بعمود automation ويجدولها للإرسال الفوري عبر dispatch الموجود.
 * التوافق الخلفي: monthly_reminders_enabled=1 تُعامل كأتمتة winback مفعّلة.
 */
export async function runCustomerAutomations(env: {
  DB: D1Database;
}): Promise<{ campaignsCreated: string[] }> {
  const now = Math.floor(Date.now() / 1000);
  const created: string[] = [];

  const shops = await env.DB.prepare(
    `SELECT s.id, s.name, s.monthly_reminder_quota_used, s.monthly_reminders_enabled
     FROM shops s
     WHERE s.subscription_tier = 'pro'
       AND s.subscription_status IN ('active', 'trial')
       AND s.suspended_at IS NULL
       AND (
         s.monthly_reminders_enabled = 1
         OR EXISTS (
           SELECT 1 FROM shop_automations a
           WHERE a.shop_id = s.id AND a.enabled = 1
         )
       )
     LIMIT 50`,
  ).all<AutomationShopRow>();

  for (const shop of shops.results ?? []) {
    const automations = await getShopAutomations(env.DB, shop.id);

    for (const auto of automations) {
      const enabled =
        auto.enabled ||
        (auto.automation === "winback" && shop.monthly_reminders_enabled === 1);
      if (!enabled) continue;

      const intervalDays = AUTOMATION_INTERVAL_DAYS[auto.automation];
      const recent = await env.DB.prepare(
        `SELECT id FROM campaigns
         WHERE shop_id = ? AND automation = ? AND created_at > ?
         LIMIT 1`,
      )
        .bind(shop.id, auto.automation, now - intervalDays * 86400)
        .first();
      if (recent) continue;

      const campaignId = await createAutomationCampaign(
        env.DB,
        shop,
        auto.automation,
        auto.config,
      );
      if (campaignId) created.push(campaignId);
    }
  }

  return { campaignsCreated: created };
}

const AUTOMATION_NAMES: Record<AutomationKind, string> = {
  winback: "أتمتة استرجاع العملاء",
  vip: "أتمتة كبار العملاء",
  referral: "أتمتة التوصيات",
};

async function createAutomationCampaign(
  db: D1Database,
  shop: AutomationShopRow,
  kind: AutomationKind,
  config: AutomationConfig,
): Promise<string | null> {
  const defaults = AUTOMATION_DEFAULTS[kind];
  const message = (config.message || defaults.message).trim();
  const quotaUsed = shop.monthly_reminder_quota_used ?? 0;
  const quota = PRICING.reminderQuota;
  if (quotaUsed >= quota) return null;

  const filters: AudienceFilters = { limit: Math.min(quota - quotaUsed, 200) };
  const targeting: Record<string, unknown> = {};
  if (kind === "winback") {
    const days = clampInt(config.days ?? defaults.days ?? 30, 7, 365);
    filters.daysSinceLastVisit = days;
    targeting.days_since_last_visit = days;
  } else if (kind === "vip") {
    const minVisits = clampInt(
      config.min_visits ?? defaults.min_visits ?? 3,
      2,
      50,
    );
    filters.minVisits = minVisits;
    targeting.min_visits = minVisits;
  } else {
    filters.ratedHighSinceDays = AUTOMATION_INTERVAL_DAYS.referral;
    targeting.rated_high_since_days = AUTOMATION_INTERVAL_DAYS.referral;
  }

  const audience = await listPastCustomers(db, shop.id, filters);
  if (audience.length === 0) return null;

  const price = priceForAudience("past_customers");
  const withinQuota = Math.min(audience.length, quota - quotaUsed);
  const overQuota = Math.max(0, audience.length - withinQuota);
  const cost = Math.round(overQuota * price * 100) / 100;

  if (cost > 0) {
    await ensureShopBalance(db, shop.id);
    const debit = await debitBalance(db, shop.id, cost);
    if (!debit.ok) {
      // اكتفِ بالحصة المجانية فقط
    }
  }

  const campaignId = generateId("cmp");
  await db
    .prepare(
      `INSERT INTO campaigns (
         id, shop_id, name, audience_type, type, status, automation, targeting,
         message, audience_count, price_per_message, cost, scheduled_at
       ) VALUES (?, ?, ?, 'past_customers', 'reminder', 'scheduled', ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      campaignId,
      shop.id,
      `${AUTOMATION_NAMES[kind]} — ${shop.name}`,
      kind,
      JSON.stringify(targeting),
      message,
      audience.length,
      price,
      cost,
    )
    .run();

  await db
    .prepare(
      `UPDATE shops
       SET monthly_reminder_quota_used = monthly_reminder_quota_used + ?
       WHERE id = ?`,
    )
    .bind(withinQuota, shop.id)
    .run();

  return campaignId;
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** إشعار منصّة → صاحب محل: يُسجَّل دائمًا في shop_notifications ويُرسل واتساب إن توفّر رقم. */
export async function notifyShopOwner(
  env: WhatsAppEnv & { DB: D1Database },
  shop: { id: string; name: string; owner_phone: string | null },
  type: string,
  message: string,
): Promise<void> {
  const id = generateId("ntf");
  if (!shop.owner_phone) {
    await env.DB.prepare(
      `INSERT INTO shop_notifications (id, shop_id, type, channel, message, status, error)
       VALUES (?, ?, ?, 'admin', ?, 'skipped', 'لا يوجد رقم جوال للمالك')`,
    )
      .bind(id, shop.id, type, message)
      .run();
    return;
  }

  try {
    const wa = await sendWhatsAppMessage(env, shop.owner_phone, message, {
      customerName: null,
      shopName: shop.name,
    });
    await env.DB.prepare(
      `INSERT INTO shop_notifications (id, shop_id, type, channel, message, status, wa_message_id)
       VALUES (?, ?, ?, 'whatsapp', ?, 'sent', ?)`,
    )
      .bind(id, shop.id, type, message, wa.messageId)
      .run();
  } catch (err) {
    const error = err instanceof Error ? err.message : "send failed";
    await env.DB.prepare(
      `INSERT INTO shop_notifications (id, shop_id, type, channel, message, status, error)
       VALUES (?, ?, ?, 'whatsapp', ?, 'failed', ?)`,
    )
      .bind(id, shop.id, type, message, error)
      .run();
  }
}

/** هل أُرسل إشعار من هذا النوع لهذا المحل خلال آخر N يوم؟ */
export async function hasRecentNotification(
  db: D1Database,
  shopId: string,
  type: string,
  withinDays: number,
): Promise<boolean> {
  const cutoff = Math.floor(Date.now() / 1000) - withinDays * 86400;
  const row = await db
    .prepare(
      `SELECT id FROM shop_notifications
       WHERE shop_id = ? AND type = ? AND created_at > ?
       LIMIT 1`,
    )
    .bind(shopId, type, cutoff)
    .first();
  return !!row;
}
