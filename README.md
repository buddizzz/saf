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
│   └── web/   # React + Vite + Tailwind (RTL + i18n)
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

1. صاحب المحل يسجّل حسابًا وينشئ محلًا → يحصل على رابط عشوائي `/q/{slug}` ورمز QR.
2. العميل يمسح الرمز، يملأ نموذج الانضمام (اسم + جوال + موافقة الخصوصية) فيحصل على رقم دور.
3. لوحة التحكم تعرض الطابور لحظيًا، ويستطيع المالك: **استدعاء التالي / تخطي / تمت الخدمة**.
4. صفحة العميل تتحدّث فورًا عبر WebSocket مع تنبيه صوتي عند اقتراب الدور وعند بدء الدور،
   ثم تقييم بعد انتهاء الخدمة.

راجع `queue-plan` لمخطط النسخة الكاملة (الباقات، الحملات، لوحة المنصة) — النسخة الحالية
تغطي نواة الطابور فقط.
