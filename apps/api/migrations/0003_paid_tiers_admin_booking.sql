-- الباقات المدفوعة + الحجز عن بُعد + لوحة تحكم المنصة

-- حقول اشتراك إضافية على المحلات
ALTER TABLE shops ADD COLUMN subscription_renews_at INTEGER;
ALTER TABLE shops ADD COLUMN monthly_reminder_quota_used INTEGER DEFAULT 0;
ALTER TABLE shops ADD COLUMN hide_powered_by INTEGER DEFAULT 0;
ALTER TABLE shops ADD COLUMN suspended_at INTEGER;
ALTER TABLE shops ADD COLUMN suspend_reason TEXT;

-- اشتراكات Pro (تجربة / يدوي في MVP — بوابة الدفع لاحقًا)
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  plan TEXT NOT NULL CHECK (plan IN ('pro_monthly', 'pro_yearly')),
  status TEXT NOT NULL DEFAULT 'active', -- active | past_due | cancelled | trial
  provider TEXT, -- trial | manual | moyasar | tap
  provider_subscription_ref TEXT,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_shop ON subscriptions(shop_id, status);

-- أوقات توفّر المحل للحجز عن بُعد (Pro)
CREATE TABLE IF NOT EXISTS shop_availability (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  slot_duration_minutes INTEGER NOT NULL DEFAULT 30,
  UNIQUE (shop_id, day_of_week)
);

-- مواعيد محجوزة عن بُعد
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  phone TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  appointment_time INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | completed | cancelled | no_show
  cancel_token TEXT UNIQUE,
  reminder_sent INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_appointments_shop_time
  ON appointments(shop_id, appointment_time, status);

-- مستخدمو لوحة المنصة
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'ops_admin', 'support_agent')),
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch())
);

-- سجل تدقيق الإجراءات الإدارية
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_id TEXT REFERENCES admin_users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);

-- بلاغات ضد المحلات
CREATE TABLE IF NOT EXISTS shop_reports (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- open | reviewing | resolved | dismissed
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_shop_reports_status ON shop_reports(status, created_at DESC);

-- كلمات محجوزة للـ slug (قابلة للإدارة من الأدمن)
CREATE TABLE IF NOT EXISTS reserved_slugs (
  slug TEXT PRIMARY KEY,
  reason TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO reserved_slugs (slug, reason) VALUES
  ('admin', 'محجوز للمنصة'),
  ('api', 'محجوز للمنصة'),
  ('www', 'محجوز للمنصة'),
  ('app', 'محجوز للمنصة'),
  ('dashboard', 'محجوز للمنصة'),
  ('login', 'محجوز للمنصة'),
  ('register', 'محجوز للمنصة'),
  ('book', 'محجوز للمنصة'),
  ('staff', 'محجوز للمنصة'),
  ('privacy', 'محجوز للمنصة'),
  ('saf', 'محجوز للمنصة'),
  ('support', 'محجوز للمنصة');
