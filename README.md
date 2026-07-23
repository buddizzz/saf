# صفّ (SAF) — نظام تنظيم انتظار العملاء

<div dir="rtl">

تطبيق ويب متجاوب (Mobile-first) لإدارة طوابير انتظار العملاء، مبني على منصة Cloudflare.
أصحاب المحلات ينشئون رمز QR، ويديرون قائمة الانتظار لحظيًا، والعملاء يمسحون الرمز
ويتابعون دورهم مع تحديثات فورية وتنبيهات صوتية.

</div>

## البنية (Monorepo)

```
saf/
├── apps/
│   ├── api/   # Cloudflare Worker (Hono + D1 + Durable Objects + WebSocket)
│   ├── web/   # React + Vite + Tailwind (RTL + i18n) — أصحاب المحلات + العملاء
│   └── admin/ # لوحة تحكم المنصة (منفصلة، منفذ 5174)
└── pnpm-workspace.yaml
```

| المكوّن | التقنية |
|---------|---------|
| API | Cloudflare Workers, Hono, D1 (SQLite), Durable Objects |
| الطابور الحي | WebSocket عبر Durable Object + مؤقّت غياب (Alarms API) |
| الواجهة | React 18, Vite, Tailwind CSS, react-i18next (RTL) |
| المصادقة | JWT (owner) + PBKDF2 لتجزئة كلمات المرور |

## المتطلبات

- Node.js ≥ 20
- pnpm 10

## الإعداد والتشغيل (تطوير)

```bash
pnpm install

# تهيئة قاعدة بيانات D1 المحلية + بيانات المواقع
pnpm --filter @saf/api db:migrate
pnpm --filter @saf/api db:seed

# تشغيل الـ API والواجهة معًا
pnpm dev
```

- الـ API: <http://localhost:8787>
- الواجهة: <http://localhost:5173> (توجّه طلبات `/api` تلقائيًا إلى الـ Worker)

أو شغّل كل خدمة على حدة: `pnpm dev:api` و `pnpm dev:web`.

## الأوامر

| الأمر | الوصف |
|-------|-------|
| `pnpm dev` | تشغيل الـ API + الواجهة معًا |
| `pnpm build` | بناء الإنتاج لكل التطبيقات |
| `pnpm lint` | فحص ESLint |
| `pnpm typecheck` | فحص أنواع TypeScript |
| `pnpm db:migrate` | تطبيق هجرات D1 محليًا |
| `pnpm db:seed` | تعبئة بيانات الدول/المدن/الأحياء |

## التدفق الأساسي (MVP)

1. صاحب المحل يسجّل حسابًا وينشئ محلًا **برقم السجل التجاري** → يحصل على رابط عشوائي `/q/{slug}` ورمز QR.
2. العميل يمسح الرمز، يملأ نموذج الانضمام (اسم + جوال + موافقة الخصوصية) فيحصل على رقم دور.
3. لوحة التحكم تعرض الطابور لحظيًا، ويستطيع المالك: **استدعاء التالي / تخطي / تمت الخدمة**.
4. صفحة العميل تتحدّث فورًا عبر WebSocket مع تنبيه صوتي عند اقتراب الدور وعند بدء الدور،
   ثم تقييم بعد انتهاء الخدمة.

### الباقات

| | مجانية | Pro (89 ر.س/شهر أو 828/سنة) |
|--|--------|------------------------------|
| المحلات | محل واحد | محلات متعددة |
| الطابور + QR + تنبيهات | ✓ | ✓ |
| الموظفون | 1 | حتى 10 |
| الحجز عن بُعد | — | ✓ |
| حملات واتساب | — | ✓ |
| قوالب + هوية كاملة + رابط مخصص | أساسي | كامل |
| إخفاء الإعلانات | — | ✓ |

راجع `queue-plan` لمخطط النسخة الكاملة.

## الباقات والحجز ولوحة المنصة وحملات واتساب

- **Pro:** تجربة 14 يومًا أو تفعيل يدوي من إعدادات المحل (بوابة الدفع آخر ميزة). يفتح الحجز عن بُعد، الحملات، القوالب الكاملة، الرابط المخصص، وإخفاء الإعلان.
- **حجز عن بُعد:** `/book/:slug` للعملاء + إعداد التوفّر من لوحة المالك (Pro).
- **حملات واتساب:** معالج خطوتين في إعدادات المحل (عملاء سابقون / جدد بالمنطقة) + تذكيرات شهرية + رصيد حملة. الإرسال عبر WhatsApp Business API أو وضع stub محليًا. بوابة الدفع (مدى/Apple Pay/STC Pay) مؤجّلة — الشحن يدوي من الأدمن أو رصيد تجريبي.
- **لوحة المنصة:** تطبيق منفصل على المنفذ 5174 (`pnpm dev:admin`) — bootstrap لأول Super Admin، إدارة المحلات، مراجعة الحملات، تعديل الرصيد، وسجل التدقيق.
- **إلغاء الاشتراك:** `/unsubscribe/:token`

## المواقع (السعودية)

قوائم المناطق/المدن/الأحياء وإحداثيات المراكز مأخوذة من
[homaily/Saudi-Arabia-Regions-Cities-and-Districts](https://github.com/homaily/Saudi-Arabia-Regions-Cities-and-Districts)
(بيانات عامة من [maps.address.gov.sa](https://maps.address.gov.sa/)، رخصة GPL-2.0).

```bash
pnpm --filter @saf/api db:migrate
pnpm --filter @saf/api db:seed            # يطبّق seed/ksa_locations.sql
pnpm --filter @saf/api db:seed:generate   # إعادة التوليد من المستودع عند الحاجة
```

الترميز الجغرافي للمحل يستخدم مركز الحي/المدينة من هذه البيانات، مع GPS اختياري من المتصفح لترتيب الأقرب ومطابقة الحي.

## PWA والأمان والنشر

- **PWA:** تثبيت على الشاشة الرئيسية + Wake Lock أثناء إدارة الطابور (`vite-plugin-pwa`).
- **اللغات:** ar / en / ur / hi / bn / tl / id / am.
- **أمان:** Argon2id لكلمات المرور، AES-GCM لـ `customers.phone_cipher`، rate limiting على auth/join/campaigns، 2FA (TOTP) للأدمن، WhatsApp webhook + قوالب Meta.
- **نشر:** `.github/workflows/deploy.yml` → Worker + Pages (`safapp.net` / `admin.safapp.net`). الأسرار عبر `wrangler secret put`. **بوابة الدفع ما زالت مؤجّلة.**
