-- السجل التجاري مطلوب عند إنشاء المحل، وفريد على مستوى المنصة.
ALTER TABLE shops ADD COLUMN commercial_registration TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_commercial_registration
  ON shops(commercial_registration)
  WHERE commercial_registration IS NOT NULL;
