// قواعد الباقات (مجانية / Pro) وبوابة الصلاحيات.

export type SubscriptionTier = "free" | "pro";
export type SubscriptionPlan = "pro_monthly" | "pro_yearly";

export const PRICING = {
  pro_monthly: { amountSar: 89, periodDays: 30 },
  pro_yearly: { amountSar: 828, periodDays: 365 },
  trialDays: 14,
  reminderQuota: 400,
} as const;

export const FREE_STAFF_LIMIT = 1;
export const PRO_STAFF_LIMIT = 10;
/** الباقة المجانية: محل واحد فقط. Pro يفتح محلات إضافية. */
export const FREE_SHOP_LIMIT = 1;
export const FREE_THEME_IDS = new Set(["modern"]);

/** رقم السجل التجاري السعودي: 10 أرقام. */
export function normalizeCommercialRegistration(
  raw: unknown,
): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, "");
  return digits || null;
}

export function isValidCommercialRegistration(cr: string): boolean {
  return /^\d{10}$/.test(cr);
}

export interface ShopSubscriptionFields {
  subscription_tier: string;
  subscription_status: string;
  subscription_renews_at: number | null;
  is_active?: number;
  suspended_at?: number | null;
}

export function isPro(shop: ShopSubscriptionFields): boolean {
  if (shop.subscription_tier !== "pro") return false;
  if (shop.subscription_status === "cancelled") {
    const renews = shop.subscription_renews_at;
    if (renews && renews > Math.floor(Date.now() / 1000)) return true;
    return false;
  }
  return (
    shop.subscription_status === "active" ||
    shop.subscription_status === "trial"
  );
}

export function staffLimit(shop: ShopSubscriptionFields): number {
  return isPro(shop) ? PRO_STAFF_LIMIT : FREE_STAFF_LIMIT;
}

export function canUseTheme(
  shop: ShopSubscriptionFields,
  themeId: string,
): boolean {
  if (isPro(shop)) return true;
  return FREE_THEME_IDS.has(themeId);
}

export function periodEndForPlan(
  plan: SubscriptionPlan,
  fromUnix = Math.floor(Date.now() / 1000),
): number {
  return fromUnix + PRICING[plan].periodDays * 24 * 60 * 60;
}

export function trialEndsAt(fromUnix = Math.floor(Date.now() / 1000)): number {
  return fromUnix + PRICING.trialDays * 24 * 60 * 60;
}
