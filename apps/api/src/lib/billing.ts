import { generateId } from "./slug";

/** خصم حجم الشحن (رصيد إضافي). */
export function volumeBonus(amountSar: number): number {
  if (amountSar >= 1000) return amountSar * 0.1;
  if (amountSar >= 200) return amountSar * 0.05;
  return 0;
}

export async function ensureShopBalance(
  db: D1Database,
  shopId: string,
): Promise<{ balance: number; auto_topup_enabled: number; auto_topup_threshold: number; auto_topup_amount: number }> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO shop_balance (shop_id, balance, updated_at)
       VALUES (?, 0, unixepoch())`,
    )
    .bind(shopId)
    .run();

  const row = await db
    .prepare(
      `SELECT balance, auto_topup_enabled, auto_topup_threshold, auto_topup_amount
       FROM shop_balance WHERE shop_id = ?`,
    )
    .bind(shopId)
    .first<{
      balance: number;
      auto_topup_enabled: number;
      auto_topup_threshold: number;
      auto_topup_amount: number;
    }>();

  return (
    row ?? {
      balance: 0,
      auto_topup_enabled: 0,
      auto_topup_threshold: 50,
      auto_topup_amount: 300,
    }
  );
}

export async function creditBalance(
  db: D1Database,
  shopId: string,
  amount: number,
  opts: {
    provider: string;
    providerRef?: string | null;
    note?: string | null;
    applyVolumeBonus?: boolean;
  },
): Promise<{ balance: number; bonus: number; paymentId: string }> {
  if (!(amount > 0)) throw new Error("amount must be positive");
  await ensureShopBalance(db, shopId);
  const bonus = opts.applyVolumeBonus ? volumeBonus(amount) : 0;
  const total = amount + bonus;
  const paymentId = generateId("pay");

  await db
    .prepare(
      `INSERT INTO payments (id, shop_id, amount, bonus_amount, provider, provider_ref, status, note)
       VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)`,
    )
    .bind(
      paymentId,
      shopId,
      amount,
      bonus,
      opts.provider,
      opts.providerRef ?? null,
      opts.note ?? null,
    )
    .run();

  await db
    .prepare(
      `UPDATE shop_balance
       SET balance = balance + ?, updated_at = unixepoch()
       WHERE shop_id = ?`,
    )
    .bind(total, shopId)
    .run();

  const bal = await ensureShopBalance(db, shopId);
  return { balance: bal.balance, bonus, paymentId };
}

export async function debitBalance(
  db: D1Database,
  shopId: string,
  amount: number,
): Promise<{ ok: true; balance: number } | { ok: false; balance: number }> {
  await ensureShopBalance(db, shopId);
  const row = await db
    .prepare(`SELECT balance FROM shop_balance WHERE shop_id = ?`)
    .bind(shopId)
    .first<{ balance: number }>();
  const balance = row?.balance ?? 0;
  if (balance + 1e-9 < amount) {
    return { ok: false, balance };
  }
  await db
    .prepare(
      `UPDATE shop_balance
       SET balance = balance - ?, updated_at = unixepoch()
       WHERE shop_id = ? AND balance >= ?`,
    )
    .bind(amount, shopId, amount)
    .run();
  const next = await ensureShopBalance(db, shopId);
  return { ok: true, balance: next.balance };
}
