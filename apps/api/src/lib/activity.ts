/** تتبّع آخر نشاط للمحل — أساس حالة متصل/غير متصل على الخريطة وتنبيهات الغياب. */

export const OFFLINE_THRESHOLD_DAYS = 7;

export async function touchShopActivity(
  db: D1Database,
  shopId: string,
): Promise<void> {
  await db
    .prepare(`UPDATE shops SET last_activity_at = unixepoch() WHERE id = ?`)
    .bind(shopId)
    .run();
}

export type ShopPresence = "online" | "offline" | "suspended";

export function shopPresence(shop: {
  is_active: number;
  suspended_at: number | null;
  last_activity_at: number | null;
}): ShopPresence {
  if (shop.suspended_at || shop.is_active !== 1) return "suspended";
  const cutoff =
    Math.floor(Date.now() / 1000) - OFFLINE_THRESHOLD_DAYS * 86400;
  if ((shop.last_activity_at ?? 0) < cutoff) return "offline";
  return "online";
}
