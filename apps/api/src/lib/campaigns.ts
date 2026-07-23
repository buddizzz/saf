import { generateId } from "./slug";
import { listNewInArea, listPastCustomers, type AudienceFilters } from "./visits";
import { isPro, PRICING, type ShopSubscriptionFields } from "./subscription";
import { hashPhone, sendWhatsAppMessage } from "./whatsapp";
import { ensureShopBalance, debitBalance } from "./billing";

export const CAMPAIGN_PRICES = {
  past_customers: 0.28,
  new_in_area: 0.35,
} as const;

export type AudienceType = keyof typeof CAMPAIGN_PRICES;

export const MODERATION_AUDIENCE_THRESHOLD = 2000;

export interface TargetingJson {
  city_id?: string | null;
  district_id?: string | null;
  gender?: string | null;
  age_category?: string | null;
  exclude_existing?: boolean;
  days_since_last_visit?: number | null;
  /** أتمتة VIP: عدد زيارات أدنى */
  min_visits?: number | null;
  /** أتمتة التوصيات: قيّم 4+ نجوم خلال آخر N يوم */
  rated_high_since_days?: number | null;
}

export function priceForAudience(type: AudienceType): number {
  return CAMPAIGN_PRICES[type];
}

export async function estimateAudience(
  db: D1Database,
  shopId: string,
  audienceType: AudienceType,
  targeting: TargetingJson,
): Promise<{ count: number; customers: Array<Record<string, unknown>> }> {
  const filters: AudienceFilters = {
    cityId: targeting.city_id,
    districtId: targeting.district_id,
    gender: targeting.gender,
    ageCategory: targeting.age_category,
    excludeShopId:
      audienceType === "new_in_area" && targeting.exclude_existing !== false
        ? shopId
        : null,
    limit: 500,
    daysSinceLastVisit: targeting.days_since_last_visit ?? null,
  };

  const customers =
    audienceType === "past_customers"
      ? await listPastCustomers(db, shopId, filters)
      : await listNewInArea(db, {
          ...filters,
          cityId: targeting.city_id ?? null,
          districtId: targeting.district_id ?? null,
        });

  // عدّ دقيق منفصل بدون حد العرض
  const count = await countAudience(db, shopId, audienceType, targeting);
  return { count, customers: customers.slice(0, 20) };
}

async function countAudience(
  db: D1Database,
  shopId: string,
  audienceType: AudienceType,
  targeting: TargetingJson,
): Promise<number> {
  if (audienceType === "past_customers") {
    const clauses = [
      "v.shop_id = ?",
      "c.marketing_consent = 1",
      "c.marketing_opted_out_at IS NULL",
    ];
    const binds: unknown[] = [shopId];
    if (targeting.gender) {
      clauses.push("c.gender = ?");
      binds.push(targeting.gender);
    }
    if (targeting.age_category) {
      clauses.push("c.age_category = ?");
      binds.push(targeting.age_category);
    }
    if (targeting.days_since_last_visit != null) {
      const cutoff =
        Math.floor(Date.now() / 1000) -
        Number(targeting.days_since_last_visit) * 86400;
      clauses.push("v.last_visit_at <= ?");
      binds.push(cutoff);
    }
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS n
         FROM customer_shop_visits v
         JOIN customers c ON c.phone = v.phone
         WHERE ${clauses.join(" AND ")}`,
      )
      .bind(...binds)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  if (!targeting.city_id && !targeting.district_id) return 0;

  const clauses = [
    "c.marketing_consent = 1",
    "c.marketing_opted_out_at IS NULL",
  ];
  const binds: unknown[] = [];
  if (targeting.district_id) {
    clauses.push("c.last_district_id = ?");
    binds.push(targeting.district_id);
  } else if (targeting.city_id) {
    clauses.push("c.last_city_id = ?");
    binds.push(targeting.city_id);
  }
  if (targeting.gender) {
    clauses.push("c.gender = ?");
    binds.push(targeting.gender);
  }
  if (targeting.age_category) {
    clauses.push("c.age_category = ?");
    binds.push(targeting.age_category);
  }
  if (targeting.exclude_existing !== false) {
    clauses.push(
      `NOT EXISTS (
         SELECT 1 FROM customer_shop_visits v
         WHERE v.phone = c.phone AND v.shop_id = ?
       )`,
    );
    binds.push(shopId);
  }

  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM customers c WHERE ${clauses.join(" AND ")}`)
    .bind(...binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function findBannedWords(
  db: D1Database,
  message: string,
): Promise<string[]> {
  const { results } = await db
    .prepare(`SELECT word FROM campaign_banned_words`)
    .all<{ word: string }>();
  const lower = message.toLowerCase();
  return (results ?? [])
    .map((r) => r.word)
    .filter((w) => lower.includes(w.toLowerCase()));
}

export async function needsManualModeration(
  db: D1Database,
  audienceType: AudienceType,
  audienceCount: number,
  message: string,
): Promise<{ needsReview: boolean; reasons: string[] }> {
  const reasons: string[] = [];
  if (audienceType === "new_in_area" && audienceCount >= MODERATION_AUDIENCE_THRESHOLD) {
    reasons.push(`audience>=${MODERATION_AUDIENCE_THRESHOLD}`);
  }
  const banned = await findBannedWords(db, message);
  if (banned.length) {
    reasons.push(`banned:${banned.join(",")}`);
  }
  return { needsReview: reasons.length > 0, reasons };
}

function personalize(
  template: string,
  vars: { name?: string | null; shopName?: string | null },
): string {
  return template
    .replaceAll("{اسم}", vars.name?.trim() || "عميلنا")
    .replaceAll("{name}", vars.name?.trim() || "عميلنا")
    .replaceAll("{اسم_المحل}", vars.shopName?.trim() || "المحل")
    .replaceAll("{shop}", vars.shopName?.trim() || "المحل");
}

export async function resolveAudiencePhones(
  db: D1Database,
  shopId: string,
  audienceType: AudienceType,
  targeting: TargetingJson,
): Promise<Array<{ phone: string; name: string | null }>> {
  const filters: AudienceFilters = {
    cityId: targeting.city_id,
    districtId: targeting.district_id,
    gender: targeting.gender,
    ageCategory: targeting.age_category,
    excludeShopId:
      audienceType === "new_in_area" && targeting.exclude_existing !== false
        ? shopId
        : null,
    limit: 5000,
    daysSinceLastVisit: targeting.days_since_last_visit ?? null,
    minVisits: targeting.min_visits ?? null,
    ratedHighSinceDays: targeting.rated_high_since_days ?? null,
  };

  const rows =
    audienceType === "past_customers"
      ? await listPastCustomers(db, shopId, filters)
      : await listNewInArea(db, filters);

  return rows.map((r) => ({
    phone: String(r.phone),
    name: (r.name as string | null) ?? null,
  }));
}

/**
 * يجهّز رسائل الحملة ويرسلها (أو يحاكي الإرسال في التطوير إن لم يُضبط توكن واتساب).
 */
export async function dispatchCampaign(
  env: {
    DB: D1Database;
    WHATSAPP_TOKEN?: string;
    WHATSAPP_PHONE_NUMBER_ID?: string;
    PUBLIC_WEB_ORIGIN?: string;
  },
  campaignId: string,
): Promise<{ sent: number; failed: number }> {
  const campaign = await env.DB.prepare(
    `SELECT c.*, s.name AS shop_name
     FROM campaigns c
     JOIN shops s ON s.id = c.shop_id
     WHERE c.id = ?`,
  )
    .bind(campaignId)
    .first<{
      id: string;
      shop_id: string;
      audience_type: AudienceType;
      targeting: string;
      message: string;
      status: string;
      shop_name: string;
      cost: number;
    }>();

  if (!campaign) throw new Error("campaign not found");
  if (
    campaign.status !== "scheduled" &&
    campaign.status !== "sending" &&
    campaign.status !== "pending_review"
  ) {
    // بعد الموافقة تصبح scheduled/sending
  }

  await env.DB.prepare(
    `UPDATE campaigns SET status = 'sending' WHERE id = ?`,
  )
    .bind(campaignId)
    .run();

  const targeting = JSON.parse(campaign.targeting) as TargetingJson;
  const audience = await resolveAudiencePhones(
    env.DB,
    campaign.shop_id,
    campaign.audience_type,
    targeting,
  );

  const origin =
    env.PUBLIC_WEB_ORIGIN?.replace(/\/$/, "") || "http://localhost:5173";
  let sent = 0;
  let failed = 0;
  const now = Math.floor(Date.now() / 1000);

  for (const person of audience) {
    const msgId = generateId("cmsg");
    const phoneHash = await hashPhone(person.phone);
    const unsub = await ensureUnsubscribeToken(env.DB, person.phone);
    const body = `${personalize(campaign.message, {
      name: person.name,
      shopName: campaign.shop_name,
    })}\n\nلإلغاء الاشتراك: ${origin}/unsubscribe/${unsub}`;

    try {
      const wa = await sendWhatsAppMessage(env, person.phone, body, {
        customerName: person.name,
        shopName: campaign.shop_name,
      });
      await env.DB.prepare(
        `INSERT INTO campaign_messages
           (id, campaign_id, phone_hash, status, wa_message_id, sent_at)
         VALUES (?, ?, ?, 'sent', ?, ?)`,
      )
        .bind(msgId, campaignId, phoneHash, wa.messageId, now)
        .run();
      sent += 1;
    } catch (err) {
      const error = err instanceof Error ? err.message : "send failed";
      await env.DB.prepare(
        `INSERT INTO campaign_messages
           (id, campaign_id, phone_hash, status, error, sent_at)
         VALUES (?, ?, ?, 'failed', ?, ?)`,
      )
        .bind(msgId, campaignId, phoneHash, error, now)
        .run();
      failed += 1;
    }
  }

  await env.DB.prepare(
    `UPDATE campaigns
     SET status = ?, sent_at = ?, audience_count = ?
     WHERE id = ?`,
  )
    .bind(
      failed > 0 && sent === 0 ? "failed" : "completed",
      now,
      audience.length,
      campaignId,
    )
    .run();

  return { sent, failed };
}

async function ensureUnsubscribeToken(
  db: D1Database,
  phone: string,
): Promise<string> {
  const row = await db
    .prepare(`SELECT unsubscribe_token FROM customers WHERE phone = ?`)
    .bind(phone)
    .first<{ unsubscribe_token: string | null }>();
  if (row?.unsubscribe_token) return row.unsubscribe_token;

  const token = generateId("unsub").replace(/^unsub_/, "");
  await db
    .prepare(`UPDATE customers SET unsubscribe_token = ? WHERE phone = ?`)
    .bind(token, phone)
    .run();
  return token;
}

export async function assertProShop(
  shop: ShopSubscriptionFields & { suspended_at?: number | null },
): Promise<string | null> {
  if (shop.suspended_at) return "المحل موقوف";
  if (!isPro(shop)) return "حملات واتساب حصرية لباقة Pro";
  return null;
}

export { ensureShopBalance, debitBalance, PRICING };
