-- حملات واتساب التسويقية (Phase 2) — بدون بوابة دفع بعد (الشحن يدوي عبر الأدمن)

-- رصيد المحل (شحن يدوي الآن؛ Moyasar/Tap لاحقًا)
CREATE TABLE IF NOT EXISTS shop_balance (
  shop_id TEXT PRIMARY KEY REFERENCES shops(id),
  balance REAL NOT NULL DEFAULT 0,
  auto_topup_enabled INTEGER DEFAULT 0,
  auto_topup_threshold REAL DEFAULT 50,
  auto_topup_amount REAL DEFAULT 300,
  updated_at INTEGER DEFAULT (unixepoch())
);

-- تذكيرات شهرية تلقائية (Pro)
ALTER TABLE shops ADD COLUMN monthly_reminders_enabled INTEGER DEFAULT 0;

-- رمز إلغاء الاشتراك من التسويق (رابط STOP)
ALTER TABLE customers ADD COLUMN unsubscribe_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_unsubscribe
  ON customers(unsubscribe_token) WHERE unsubscribe_token IS NOT NULL;

-- الحملات
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  audience_type TEXT NOT NULL CHECK (audience_type IN ('past_customers', 'new_in_area')),
  type TEXT NOT NULL DEFAULT 'whatsapp' CHECK (type IN ('whatsapp', 'reminder')),
  status TEXT NOT NULL DEFAULT 'draft',
  -- draft | pending_review | scheduled | sending | completed | failed | rejected | cancelled
  targeting TEXT NOT NULL, -- JSON
  message TEXT NOT NULL,
  audience_count INTEGER DEFAULT 0,
  price_per_message REAL NOT NULL,
  cost REAL DEFAULT 0,
  scheduled_at INTEGER,
  sent_at INTEGER,
  rejection_reason TEXT,
  moderated_by TEXT,
  moderated_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_campaigns_shop ON campaigns(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status, scheduled_at);

-- سجل الإرسال (phone_hash فقط — لا يُعرض الرقم للمالك)
CREATE TABLE IF NOT EXISTS campaign_messages (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  phone_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | sent | delivered | read | failed | skipped
  wa_message_id TEXT,
  error TEXT,
  sent_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_campaign_messages_campaign
  ON campaign_messages(campaign_id, status);

-- سجل شحن الرصيد (يدوي الآن؛ بوابة الدفع لاحقًا)
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  amount REAL NOT NULL,
  bonus_amount REAL DEFAULT 0,
  provider TEXT, -- manual | mada | apple_pay | stc_pay | moyasar | tap
  provider_ref TEXT,
  status TEXT NOT NULL DEFAULT 'completed', -- pending | completed | failed | refunded
  note TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_payments_shop ON payments(shop_id, created_at DESC);

-- كلمات محظورة لمراجعة الحملات
CREATE TABLE IF NOT EXISTS campaign_banned_words (
  word TEXT PRIMARY KEY,
  created_at INTEGER DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO campaign_banned_words (word) VALUES
  ('قمار'),
  ('كازينو'),
  ('ميسر'),
  ('gambling'),
  ('casino'),
  ('bitcoin scam'),
  ('ربح مضمون');
