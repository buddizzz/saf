-- خريطة المحلات + دورة حياة الاشتراك + أتمتة التسويق (خطة التسويق من صفحة واحدة)

-- آخر نشاط للمحل (انضمام عميل / استدعاء / إتمام / تعديل المالك) — أساس حالة متصل/غير متصل
ALTER TABLE shops ADD COLUMN last_activity_at INTEGER;
UPDATE shops SET last_activity_at = created_at WHERE last_activity_at IS NULL;

-- إشعارات المنصة لأصحاب المحلات (واتساب) + تنبيهات لوحة الأدمن
CREATE TABLE IF NOT EXISTS shop_notifications (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  type TEXT NOT NULL,
  -- offline_week | trial_ending | renewal_due_7d | renewal_due_1d | subscription_expired
  channel TEXT NOT NULL DEFAULT 'whatsapp', -- whatsapp | admin
  message TEXT,
  status TEXT NOT NULL DEFAULT 'sent', -- sent | failed | skipped
  error TEXT,
  wa_message_id TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_shop_notifications_shop_type
  ON shop_notifications(shop_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_notifications_created
  ON shop_notifications(created_at DESC);

-- أتمتة تسويق المحل لعملائه (مرحلة «بعد الشراء» من خطة التسويق من صفحة واحدة)
CREATE TABLE IF NOT EXISTS shop_automations (
  shop_id TEXT NOT NULL REFERENCES shops(id),
  automation TEXT NOT NULL CHECK (automation IN ('winback', 'vip', 'referral')),
  enabled INTEGER NOT NULL DEFAULT 0,
  config TEXT, -- JSON: { days, message, min_visits }
  updated_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (shop_id, automation)
);

-- تمييز الحملات المولّدة تلقائيًا حسب نوع الأتمتة (للتفريق وعدم التكرار)
ALTER TABLE campaigns ADD COLUMN automation TEXT;
