-- تعبئة أولية لبيانات الموقع (السعودية + مدنها الرئيسية + أحياء مختارة).

INSERT OR IGNORE INTO countries (code, name_ar, name_en) VALUES
  ('SA', 'السعودية', 'Saudi Arabia'),
  ('AE', 'الإمارات', 'United Arab Emirates'),
  ('KW', 'الكويت', 'Kuwait');

INSERT OR IGNORE INTO cities (id, country_code, name_ar, name_en) VALUES
  ('sa-riyadh', 'SA', 'الرياض', 'Riyadh'),
  ('sa-jeddah', 'SA', 'جدة', 'Jeddah'),
  ('sa-dammam', 'SA', 'الدمام', 'Dammam'),
  ('sa-makkah', 'SA', 'مكة المكرمة', 'Makkah'),
  ('sa-madinah', 'SA', 'المدينة المنورة', 'Madinah');

INSERT OR IGNORE INTO districts (id, city_id, name_ar, name_en) VALUES
  ('riyadh-olaya', 'sa-riyadh', 'العليا', 'Al Olaya'),
  ('riyadh-malaz', 'sa-riyadh', 'الملز', 'Al Malaz'),
  ('riyadh-narjis', 'sa-riyadh', 'النرجس', 'Al Narjis'),
  ('jeddah-hamra', 'sa-jeddah', 'الحمراء', 'Al Hamra'),
  ('jeddah-salamah', 'sa-jeddah', 'السلامة', 'Al Salamah'),
  ('dammam-shatea', 'sa-dammam', 'الشاطئ', 'Al Shatea');
