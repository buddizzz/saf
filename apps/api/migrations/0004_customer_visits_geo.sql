-- زيارات العملاء للمحلات + إثراء الموقع (GPS / OpenStreetMap) للحملات

-- سجل زيارات العميل لكل محل (أساس استهداف "عملاء سابقون" في واتساب)
CREATE TABLE IF NOT EXISTS customer_shop_visits (
  phone TEXT NOT NULL,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  first_visit_at INTEGER NOT NULL,
  last_visit_at INTEGER NOT NULL,
  visit_count INTEGER NOT NULL DEFAULT 1,
  last_gender TEXT,
  last_age_category TEXT,
  PRIMARY KEY (phone, shop_id)
);
CREATE INDEX IF NOT EXISTS idx_visits_shop_time
  ON customer_shop_visits(shop_id, last_visit_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_phone
  ON customer_shop_visits(phone, last_visit_at DESC);

-- فهرس استهداف الحملات على العملاء
CREATE INDEX IF NOT EXISTS idx_customers_targeting
  ON customers(last_country_code, last_city_id, last_district_id, marketing_consent);

-- آخر إحداثيات معروفة للعميل (من جهازه عند الانضمام، اختيارية)
ALTER TABLE customers ADD COLUMN last_lat REAL;
ALTER TABLE customers ADD COLUMN last_lng REAL;

-- إثراء موقع المحل من OpenStreetMap / Nominatim
ALTER TABLE shops ADD COLUMN osm_place_id TEXT;
ALTER TABLE shops ADD COLUMN osm_display_name TEXT;
ALTER TABLE shops ADD COLUMN location_source TEXT; -- gps | osm_geocode | manual | none
ALTER TABLE shops ADD COLUMN location_updated_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_shops_geo ON shops(lat, lng);
CREATE INDEX IF NOT EXISTS idx_shops_city ON shops(country_code, city_id, district_id);

-- تعبئة سجل الزيارات من طوابير سابقة إن وُجدت
INSERT OR IGNORE INTO customer_shop_visits (
  phone, shop_id, first_visit_at, last_visit_at, visit_count, last_gender, last_age_category
)
SELECT
  phone,
  shop_id,
  MIN(created_at),
  MAX(created_at),
  COUNT(*),
  NULL,
  NULL
FROM queue_entries
WHERE phone IS NOT NULL AND phone != ''
GROUP BY phone, shop_id;

-- نسخ موقع آخر محل زاره العميل إلى حقول الاستهداف إن كانت فارغة
UPDATE customers
SET
  last_country_code = (
    SELECT s.country_code FROM customer_shop_visits v
    JOIN shops s ON s.id = v.shop_id
    WHERE v.phone = customers.phone
    ORDER BY v.last_visit_at DESC LIMIT 1
  ),
  last_city_id = (
    SELECT s.city_id FROM customer_shop_visits v
    JOIN shops s ON s.id = v.shop_id
    WHERE v.phone = customers.phone
    ORDER BY v.last_visit_at DESC LIMIT 1
  ),
  last_district_id = (
    SELECT s.district_id FROM customer_shop_visits v
    JOIN shops s ON s.id = v.shop_id
    WHERE v.phone = customers.phone
    ORDER BY v.last_visit_at DESC LIMIT 1
  ),
  last_lat = COALESCE(last_lat, (
    SELECT s.lat FROM customer_shop_visits v
    JOIN shops s ON s.id = v.shop_id
    WHERE v.phone = customers.phone AND s.lat IS NOT NULL
    ORDER BY v.last_visit_at DESC LIMIT 1
  )),
  last_lng = COALESCE(last_lng, (
    SELECT s.lng FROM customer_shop_visits v
    JOIN shops s ON s.id = v.shop_id
    WHERE v.phone = customers.phone AND s.lng IS NOT NULL
    ORDER BY v.last_visit_at DESC LIMIT 1
  ))
WHERE EXISTS (
  SELECT 1 FROM customer_shop_visits v WHERE v.phone = customers.phone
);
