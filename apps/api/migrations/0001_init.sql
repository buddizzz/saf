-- SAF (صفّ) — مخطط قاعدة البيانات الأساسي لنسخة MVP
-- يغطي: الملاك، المحلات، الموظفين، الموقع الجغرافي، العملاء، وقائمة الانتظار.

-- أصحاب المحلات
CREATE TABLE IF NOT EXISTS owners (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- قائمة الدول المدعومة
CREATE TABLE IF NOT EXISTS countries (
  code TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL
);

-- قائمة المدن (مرتبطة بدولة)
CREATE TABLE IF NOT EXISTS cities (
  id TEXT PRIMARY KEY,
  country_code TEXT REFERENCES countries(code),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL
);

-- قائمة الأحياء (مرتبطة بمدينة)
CREATE TABLE IF NOT EXISTS districts (
  id TEXT PRIMARY KEY,
  city_id TEXT REFERENCES cities(id),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL
);

-- المحلات
CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES owners(id),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  slug_type TEXT DEFAULT 'random',
  shop_type TEXT NOT NULL,
  country_code TEXT REFERENCES countries(code),
  city_id TEXT REFERENCES cities(id),
  district_id TEXT REFERENCES districts(id),
  district_name_free TEXT,
  lat REAL,
  lng REAL,
  address_detail TEXT,
  theme_id TEXT DEFAULT 'modern',
  theme_custom TEXT,
  logo_url TEXT,
  is_active INTEGER DEFAULT 1,
  is_accepting_queue INTEGER DEFAULT 1,
  working_hours TEXT,
  avg_service_seconds INTEGER DEFAULT 300,
  subscription_tier TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'active',
  created_at INTEGER DEFAULT (unixepoch())
);

-- موظفو المحل (دخول سريع بـ PIN)
CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id),
  name TEXT NOT NULL,
  pin_code_hash TEXT NOT NULL,
  role TEXT DEFAULT 'staff',
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch())
);

-- سجل العملاء الموحّد على مستوى المنصة
CREATE TABLE IF NOT EXISTS customers (
  phone TEXT PRIMARY KEY,
  name TEXT,
  gender TEXT CHECK (gender IN ('male', 'female')),
  age_category TEXT CHECK (age_category IN ('13_17', '18_34', '35_54', '55_plus')),
  last_country_code TEXT,
  last_city_id TEXT,
  last_district_id TEXT,
  marketing_consent INTEGER DEFAULT 0,
  marketing_opted_out_at INTEGER,
  last_visit_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

-- العملاء في قائمة الانتظار
CREATE TABLE IF NOT EXISTS queue_entries (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id),
  phone TEXT REFERENCES customers(phone),
  queue_date TEXT NOT NULL DEFAULT (date('now')),
  queue_number INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female')),
  age_category TEXT CHECK (age_category IN ('13_17', '18_34', '35_54', '55_plus')),
  status TEXT DEFAULT 'waiting',
  session_token TEXT UNIQUE,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  consent_given INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  called_at INTEGER,
  completed_at INTEGER
);

-- الفهارس
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_daily ON queue_entries (shop_id, queue_date, queue_number);
CREATE INDEX IF NOT EXISTS idx_queue_shop_status ON queue_entries (shop_id, status, queue_date);
CREATE INDEX IF NOT EXISTS idx_queue_session ON queue_entries (session_token);
CREATE INDEX IF NOT EXISTS idx_shops_slug ON shops (slug);
CREATE INDEX IF NOT EXISTS idx_staff_shop ON staff (shop_id);
CREATE INDEX IF NOT EXISTS idx_cities_country ON cities (country_code);
CREATE INDEX IF NOT EXISTS idx_districts_city ON districts (city_id);
