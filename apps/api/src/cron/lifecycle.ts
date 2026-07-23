import type { Env } from "../types";
import { OFFLINE_THRESHOLD_DAYS } from "../lib/activity";
import { hasRecentNotification, notifyShopOwner } from "../lib/automations";
import { PRICING } from "../lib/subscription";

/**
 * Cron دورة حياة المحلات (المنصة ← أصحاب المحلات عبر واتساب):
 * - إنهاء الاشتراكات المنتهية (Pro → Free) + رسالة استرجاع.
 * - تذكير قرب انتهاء التجربة (3 أيام).
 * - تذكير تجديد الاشتراك (7 أيام + يوم واحد).
 * - تنبيه المحلات غير النشطة لأسبوع (offline) — يتكرر أسبوعيًا ما دام المحل غائبًا.
 */

interface LifecycleShopRow {
  id: string;
  name: string;
  slug: string;
  subscription_status: string;
  subscription_renews_at: number | null;
  last_activity_at: number | null;
  owner_phone: string | null;
}

export async function runLifecycleCron(env: Env): Promise<{
  expired: number;
  trialEnding: number;
  renewalDue: number;
  offlineAlerts: number;
}> {
  const now = Math.floor(Date.now() / 1000);
  const origin =
    env.PUBLIC_WEB_ORIGIN?.replace(/\/$/, "") || "http://localhost:5173";
  const dashboardUrl = `${origin}/dashboard`;

  let expired = 0;
  let trialEnding = 0;
  let renewalDue = 0;
  let offlineAlerts = 0;

  // 1) إنهاء الاشتراكات المنتهية + رسالة استرجاع (win-back)
  const overdue = await env.DB.prepare(
    `SELECT s.id, s.name, s.slug, s.subscription_status, s.subscription_renews_at,
            s.last_activity_at, o.phone AS owner_phone
     FROM shops s JOIN owners o ON o.id = s.owner_id
     WHERE s.subscription_tier = 'pro'
       AND s.subscription_renews_at IS NOT NULL
       AND s.subscription_renews_at < ?
     LIMIT 100`,
  )
    .bind(now)
    .all<LifecycleShopRow>();

  for (const shop of overdue.results ?? []) {
    await env.DB.prepare(
      `UPDATE shops
       SET subscription_tier = 'free', subscription_status = 'active',
           subscription_renews_at = NULL, hide_powered_by = 0
       WHERE id = ?`,
    )
      .bind(shop.id)
      .run();
    await env.DB.prepare(
      `UPDATE subscriptions SET status = 'cancelled', cancel_at_period_end = 1
       WHERE shop_id = ? AND status IN ('active', 'trial')`,
    )
      .bind(shop.id)
      .run();

    if (!(await hasRecentNotification(env.DB, shop.id, "subscription_expired", 30))) {
      const wasTrial = shop.subscription_status === "trial";
      const message = wasTrial
        ? `انتهت تجربة Pro لمحل «${shop.name}» 😢\n` +
          `رجع مزايا Pro (حملات واتساب، الحجز عن بُعد، التذكيرات التلقائية) بـ ${PRICING.pro_monthly.amountSar} ر.س/شهر فقط.\n` +
          `فعّل الآن: ${dashboardUrl}`
        : `انتهى اشتراك Pro لمحل «${shop.name}».\n` +
          `عملاؤك ينتظرون حملاتك وتذكيراتك التلقائية — جدّد الآن بـ ${PRICING.pro_monthly.amountSar} ر.س/شهر واستعد كل المزايا.\n` +
          `جدّد من هنا: ${dashboardUrl}`;
      await notifyShopOwner(env, {
        id: shop.id,
        name: shop.name,
        owner_phone: shop.owner_phone,
      }, "subscription_expired", message);
    }
    expired += 1;
  }

  // 2) قرب انتهاء التجربة (خلال 3 أيام)
  const trials = await env.DB.prepare(
    `SELECT s.id, s.name, s.slug, s.subscription_status, s.subscription_renews_at,
            s.last_activity_at, o.phone AS owner_phone
     FROM shops s JOIN owners o ON o.id = s.owner_id
     WHERE s.subscription_tier = 'pro'
       AND s.subscription_status = 'trial'
       AND s.subscription_renews_at BETWEEN ? AND ?
       AND s.suspended_at IS NULL
     LIMIT 100`,
  )
    .bind(now, now + 3 * 86400)
    .all<LifecycleShopRow>();

  for (const shop of trials.results ?? []) {
    if (await hasRecentNotification(env.DB, shop.id, "trial_ending", 10)) continue;
    const daysLeft = Math.max(
      1,
      Math.ceil(((shop.subscription_renews_at ?? now) - now) / 86400),
    );
    const message =
      `تجربة Pro لمحل «${shop.name}» تنتهي خلال ${daysLeft} ${daysLeft === 1 ? "يوم" : "أيام"} ⏳\n` +
      `لا تفقد حملات واتساب والتذكيرات التلقائية وعملاءك الدائمين.\n` +
      `اشترك الآن بـ ${PRICING.pro_monthly.amountSar} ر.س/شهر: ${dashboardUrl}`;
    await notifyShopOwner(env, {
      id: shop.id,
      name: shop.name,
      owner_phone: shop.owner_phone,
    }, "trial_ending", message);
    trialEnding += 1;
  }

  // 3) تذكير تجديد الاشتراك المدفوع (7 أيام ثم يوم واحد)
  const renewalWindows: Array<{ type: string; days: number; dedupeDays: number }> = [
    { type: "renewal_due_7d", days: 7, dedupeDays: 10 },
    { type: "renewal_due_1d", days: 1, dedupeDays: 5 },
  ];

  for (const window of renewalWindows) {
    const due = await env.DB.prepare(
      `SELECT s.id, s.name, s.slug, s.subscription_status, s.subscription_renews_at,
              s.last_activity_at, o.phone AS owner_phone
       FROM shops s JOIN owners o ON o.id = s.owner_id
       WHERE s.subscription_tier = 'pro'
         AND s.subscription_status = 'active'
         AND s.subscription_renews_at BETWEEN ? AND ?
         AND s.suspended_at IS NULL
       LIMIT 100`,
    )
      .bind(now, now + window.days * 86400)
      .all<LifecycleShopRow>();

    for (const shop of due.results ?? []) {
      if (await hasRecentNotification(env.DB, shop.id, window.type, window.dedupeDays)) {
        continue;
      }
      const daysLeft = Math.max(
        1,
        Math.ceil(((shop.subscription_renews_at ?? now) - now) / 86400),
      );
      const message =
        `اشتراك Pro لمحل «${shop.name}» يستحق التجديد خلال ${daysLeft} ${daysLeft === 1 ? "يوم" : "أيام"} 🔔\n` +
        `جدّد الآن ليستمر عملاؤك في استلام تذكيراتك وعروضك تلقائيًا دون انقطاع.\n` +
        `التجديد: ${dashboardUrl}`;
      await notifyShopOwner(env, {
        id: shop.id,
        name: shop.name,
        owner_phone: shop.owner_phone,
      }, window.type, message);
      renewalDue += 1;
    }
  }

  // 4) محلات غير نشطة لأسبوع كامل — تنبيه أسبوعي حتى تعود
  const offlineCutoff = now - OFFLINE_THRESHOLD_DAYS * 86400;
  // إعادة الإرسال كل 7 أيام (مع هامش ساعة لانحراف الجدولة)
  const resendWindowDays = OFFLINE_THRESHOLD_DAYS - 1 / 24;

  const offline = await env.DB.prepare(
    `SELECT s.id, s.name, s.slug, s.subscription_status, s.subscription_renews_at,
            s.last_activity_at, o.phone AS owner_phone
     FROM shops s JOIN owners o ON o.id = s.owner_id
     WHERE s.is_active = 1
       AND s.suspended_at IS NULL
       AND COALESCE(s.last_activity_at, 0) < ?
     LIMIT 100`,
  )
    .bind(offlineCutoff)
    .all<LifecycleShopRow>();

  for (const shop of offline.results ?? []) {
    if (
      await hasRecentNotification(env.DB, shop.id, "offline_week", resendWindowDays)
    ) {
      continue;
    }
    const message =
      `محلك «${shop.name}» بدون أي نشاط منذ أسبوع كامل 📭\n` +
      `عملاؤك يبحثون عنك — افتح الطابور اليوم واستقبلهم من جديد، وسنتولى تذكير عملائك السابقين تلقائيًا.\n` +
      `لوحة التحكم: ${dashboardUrl}`;
    await notifyShopOwner(env, {
      id: shop.id,
      name: shop.name,
      owner_phone: shop.owner_phone,
    }, "offline_week", message);
    offlineAlerts += 1;
  }

  return { expired, trialEnding, renewalDue, offlineAlerts };
}
