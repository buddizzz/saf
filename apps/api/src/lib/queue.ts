import type { QueueEntry, QueueSnapshot } from "../types";
import { generateId, generateSlug } from "./slug";

// تاريخ اليوم بتوقيت السعودية (Asia/Riyadh) لإعادة الترقيم اليومي.
export function todayInRiyadh(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

export async function getSnapshot(
  db: D1Database,
  shopId: string,
): Promise<QueueSnapshot> {
  const queueDate = todayInRiyadh();

  const shop = await db
    .prepare("SELECT avg_service_seconds FROM shops WHERE id = ?")
    .bind(shopId)
    .first<{ avg_service_seconds: number }>();

  const { results } = await db
    .prepare(
      `SELECT queue_number, customer_name, status, called_at
       FROM queue_entries
       WHERE shop_id = ? AND queue_date = ?
       ORDER BY queue_number ASC`,
    )
    .bind(shopId, queueDate)
    .all<{
      queue_number: number;
      customer_name: string;
      status: string;
      called_at: number | null;
    }>();

  const entries = results ?? [];
  const called = entries.find((e) => e.status === "called");
  const waitingCount = entries.filter((e) => e.status === "waiting").length;

  return {
    shopId,
    queueDate,
    currentServing: called ? called.queue_number : null,
    waitingCount,
    avgServiceSeconds: shop?.avg_service_seconds ?? 300,
    entries: entries.map((e) => ({
      queueNumber: e.queue_number,
      name: e.customer_name,
      status: e.status as QueueEntry["status"],
      calledAt: e.called_at,
    })),
  };
}

export interface JoinInput {
  name: string;
  phone: string;
  gender?: "male" | "female" | null;
  ageCategory?: string | null;
  consent: boolean;
}

export async function joinQueue(
  db: D1Database,
  shopId: string,
  input: JoinInput,
): Promise<QueueEntry> {
  const queueDate = todayInRiyadh();
  const now = Math.floor(Date.now() / 1000);

  // upsert للعميل الموحّد
  await db
    .prepare(
      `INSERT INTO customers (phone, name, gender, age_category, last_visit_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET
         name = excluded.name,
         gender = excluded.gender,
         age_category = excluded.age_category,
         last_visit_at = excluded.last_visit_at`,
    )
    .bind(input.phone, input.name, input.gender ?? null, input.ageCategory ?? null, now)
    .run();

  const maxRow = await db
    .prepare(
      `SELECT COALESCE(MAX(queue_number), 0) AS max_num
       FROM queue_entries WHERE shop_id = ? AND queue_date = ?`,
    )
    .bind(shopId, queueDate)
    .first<{ max_num: number }>();

  const queueNumber = (maxRow?.max_num ?? 0) + 1;
  const id = generateId("q");
  const sessionToken = generateSlug(24);

  await db
    .prepare(
      `INSERT INTO queue_entries
        (id, shop_id, phone, queue_date, queue_number, customer_name, gender, age_category, status, session_token, consent_given, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?, ?)`,
    )
    .bind(
      id,
      shopId,
      input.phone,
      queueDate,
      queueNumber,
      input.name,
      input.gender ?? null,
      input.ageCategory ?? null,
      sessionToken,
      input.consent ? 1 : 0,
      now,
    )
    .run();

  return {
    id,
    shop_id: shopId,
    phone: input.phone,
    queue_date: queueDate,
    queue_number: queueNumber,
    customer_name: input.name,
    gender: input.gender ?? null,
    age_category: input.ageCategory ?? null,
    status: "waiting",
    session_token: sessionToken,
    rating: null,
    created_at: now,
    called_at: null,
    completed_at: null,
  };
}

export async function getBySession(
  db: D1Database,
  sessionToken: string,
): Promise<{ entry: QueueEntry; snapshot: QueueSnapshot } | null> {
  const entry = await db
    .prepare("SELECT * FROM queue_entries WHERE session_token = ?")
    .bind(sessionToken)
    .first<QueueEntry>();
  if (!entry) return null;
  const snapshot = await getSnapshot(db, entry.shop_id);
  return { entry, snapshot };
}

// استدعاء العميل التالي. يعيد رقم الدور المستدعى أو null إن لم يبقَ منتظرون.
export async function callNext(
  db: D1Database,
  shopId: string,
): Promise<number | null> {
  const queueDate = todayInRiyadh();
  const now = Math.floor(Date.now() / 1000);

  // أنهِ العميل المستدعى حاليًا (يُحدّث متوسط زمن الخدمة) قبل استدعاء التالي.
  await completeCurrent(db, shopId);

  const next = await db
    .prepare(
      `SELECT id, queue_number FROM queue_entries
       WHERE shop_id = ? AND queue_date = ? AND status = 'waiting'
       ORDER BY queue_number ASC LIMIT 1`,
    )
    .bind(shopId, queueDate)
    .first<{ id: string; queue_number: number }>();

  if (!next) return null;

  await db
    .prepare(
      "UPDATE queue_entries SET status = 'called', called_at = ? WHERE id = ?",
    )
    .bind(now, next.id)
    .run();

  return next.queue_number;
}

export async function skipCurrent(
  db: D1Database,
  shopId: string,
  reason: "cancelled" | "no_show" = "cancelled",
): Promise<void> {
  const queueDate = todayInRiyadh();
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `UPDATE queue_entries SET status = ?, completed_at = ?
       WHERE shop_id = ? AND queue_date = ? AND status = 'called'`,
    )
    .bind(reason, now, shopId, queueDate)
    .run();
}

export async function completeCurrent(
  db: D1Database,
  shopId: string,
): Promise<void> {
  const queueDate = todayInRiyadh();
  const now = Math.floor(Date.now() / 1000);

  const current = await db
    .prepare(
      `SELECT id, called_at FROM queue_entries
       WHERE shop_id = ? AND queue_date = ? AND status = 'called' LIMIT 1`,
    )
    .bind(shopId, queueDate)
    .first<{ id: string; called_at: number | null }>();

  if (!current) return;

  await db
    .prepare(
      "UPDATE queue_entries SET status = 'served', completed_at = ? WHERE id = ?",
    )
    .bind(now, current.id)
    .run();

  // تحديث متوسط زمن الخدمة (متوسط متحرك) لحساب ETA.
  if (current.called_at) {
    const serviceSeconds = Math.max(30, now - current.called_at);
    await db
      .prepare(
        `UPDATE shops
         SET avg_service_seconds = CAST(avg_service_seconds * 0.8 + ? * 0.2 AS INTEGER)
         WHERE id = ?`,
      )
      .bind(serviceSeconds, shopId)
      .run();
  }
}

export async function rateEntry(
  db: D1Database,
  sessionToken: string,
  rating: number,
): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE queue_entries SET rating = ? WHERE session_token = ? AND status = 'served'",
    )
    .bind(rating, sessionToken)
    .run();
  return (res.meta.changes ?? 0) > 0;
}
