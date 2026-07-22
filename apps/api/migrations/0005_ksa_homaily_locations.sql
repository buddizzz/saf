-- بيانات المواقع السعودية الرسمية (homaily / address.gov.sa)
-- وإحداثيات المركز للمدن والأحياء بدل الاعتماد على Nominatim للبحث الجغرافي.

CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  capital_city_id TEXT,
  population INTEGER,
  lat REAL,
  lng REAL,
  source TEXT DEFAULT 'homaily'
);

ALTER TABLE cities ADD COLUMN region_id TEXT;
ALTER TABLE cities ADD COLUMN lat REAL;
ALTER TABLE cities ADD COLUMN lng REAL;
ALTER TABLE cities ADD COLUMN source TEXT;
ALTER TABLE cities ADD COLUMN source_id INTEGER;

ALTER TABLE districts ADD COLUMN region_id TEXT;
ALTER TABLE districts ADD COLUMN lat REAL;
ALTER TABLE districts ADD COLUMN lng REAL;
ALTER TABLE districts ADD COLUMN source TEXT;
ALTER TABLE districts ADD COLUMN source_id TEXT;

CREATE INDEX IF NOT EXISTS idx_cities_region ON cities(region_id, name_ar);
CREATE INDEX IF NOT EXISTS idx_cities_geo ON cities(lat, lng);
CREATE INDEX IF NOT EXISTS idx_districts_region ON districts(region_id);
CREATE INDEX IF NOT EXISTS idx_districts_geo ON districts(lat, lng);
CREATE INDEX IF NOT EXISTS idx_regions_code ON regions(code);
