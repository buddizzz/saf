-- أمان: 2FA للأدمن + حقل تشفير الجوال على العملاء

ALTER TABLE admin_users ADD COLUMN totp_secret TEXT;
ALTER TABLE admin_users ADD COLUMN totp_enabled INTEGER DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN totp_enrolled_at INTEGER;
ALTER TABLE admin_users ADD COLUMN failed_login_count INTEGER DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN locked_until INTEGER;

-- نسخة مشفّرة من الجوال (AES-256-GCM) — phone يبقى مفتاح الربط التشغيلي
ALTER TABLE customers ADD COLUMN phone_cipher TEXT;

-- محاولات دخول فاشلة للأدمن في سجل التدقيق تُسجَّل عبر الكود
