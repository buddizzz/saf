import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Logo } from "../components/Logo";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { Reveal } from "../components/Reveal";

const FEATURE_ICONS = [
  // نبضة لحظية (طابور مباشر)
  <path
    key="pulse"
    d="M3 12h4l2-6 4 12 2-6h6"
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
  // رمز QR
  <g key="qr">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <path d="M14 14h3v3h-3zM19 19h2M14 21h2M19 14v2" strokeLinecap="round" />
  </g>,
  // جرس تنبيه
  <path
    key="bell"
    d="M12 3a5 5 0 0 0-5 5v3.5c0 .8-.3 1.6-.9 2.1L5 15h14l-1.1-1.4a3 3 0 0 1-.9-2.1V8a5 5 0 0 0-5-5ZM9.5 18a2.5 2.5 0 0 0 5 0"
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
];

const ArrowIcon = (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
    className="transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1"
  >
    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function LandingPage() {
  const { t } = useTranslation();
  return (
    <div className="relative min-h-screen overflow-hidden">
      <BackgroundOrbs />

      <header className="sticky top-0 z-30 px-4 pt-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between rounded-full border border-white/60 bg-white/70 px-5 py-3 shadow-card backdrop-blur-xl">
          <Logo size={36} />
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher />
            <Link to="/login" className="hidden font-bold text-brand-700 transition hover:text-brand-500 sm:inline">
              {t("landing.ctaLogin")}
            </Link>
            <Link to="/register" className="btn-primary !px-5 !py-2 text-sm">
              {t("landing.ctaOwner")}
            </Link>
          </div>
        </div>
      </header>

      <main className="relative">
        {/* البطل — عنوان ضخم بأسلوب الاستوديوهات الإبداعية */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-14 md:grid-cols-[1.15fr_1fr] md:pb-28 md:pt-24">
          <div>
            <Reveal>
              <div className="mb-6 flex flex-wrap items-center gap-3">
                <span className="kicker">
                  <span className="h-px w-8 bg-gold-400" />
                  {t("landing.heroKicker")}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-950 py-1 pe-3 ps-1.5 text-xs font-bold text-white shadow-sm">
                  <span className="rounded-full bg-gold-400 px-2 py-0.5 text-[10px] font-extrabold text-brand-950">
                    {t("landing.newBadgeTag")}
                  </span>
                  {t("landing.newBadgeText")}
                </span>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <h1 className="mb-6 text-5xl font-black leading-[1.08] tracking-tight text-brand-950 md:text-7xl">
                {t("landing.heroTitle")}
                <span className="mx-3 inline-block animate-gradient-pan bg-gradient-to-l from-brand-500 via-gold-400 to-brand-500 bg-[length:200%_auto] bg-clip-text text-transparent">
                  .
                </span>
              </h1>
            </Reveal>
            <Reveal delay={200}>
              <p className="mb-9 max-w-lg text-lg leading-relaxed text-brand-900/60">
                {t("landing.heroSubtitle")}
              </p>
            </Reveal>
            <Reveal delay={300}>
              <div className="flex flex-wrap gap-3">
                <Link to="/register" className="btn-primary group">
                  {t("landing.ctaOwner")}
                  {ArrowIcon}
                </Link>
                <Link to="/login" className="btn-ghost">
                  {t("landing.ctaLogin")}
                </Link>
              </div>
            </Reveal>
          </div>
          <Reveal delay={250} className="relative">
            <LiveTicketPreview />
          </Reveal>
        </section>

        {/* شريط متحرك بأنواع المحلات — إيقاع بصري بأسلوب استوديو Voila */}
        <ShopTypesMarquee />

        {/* المزايا — بطاقات مرقّمة تنكشف بالتمرير */}
        <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <Reveal>
            <span className="kicker mb-4">
              <span className="h-px w-8 bg-gold-400" />
              {t("landing.statsTitle")}
            </span>
          </Reveal>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {([0, 1, 2] as const).map((i) => (
              <Reveal key={i} delay={i * 120}>
                <FeatureCard
                  index={i}
                  icon={FEATURE_ICONS[i]}
                  title={t(`landing.feature${i + 1}Title`)}
                  body={t(`landing.feature${i + 1}Body`)}
                />
              </Reveal>
            ))}
          </div>
        </section>

        {/* أرقام ضخمة على خلفية داكنة بحبيبات سينمائية */}
        <section className="px-6 pb-20 md:pb-28">
          <div className="grain relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-brand-950 px-6 py-16 sm:px-12">
            <div className="pointer-events-none absolute -end-24 -top-24 h-80 w-80 animate-orb-drift rounded-full bg-gold-400/15 blur-3xl" />
            <div className="pointer-events-none absolute -start-16 bottom-0 h-64 w-64 animate-orb-drift rounded-full bg-brand-400/20 blur-3xl [animation-delay:3s]" />
            <div className="relative grid gap-10 sm:grid-cols-3">
              {([1, 2, 3] as const).map((i, idx) => (
                <Reveal key={i} delay={idx * 150}>
                  <div className="text-center sm:text-start">
                    <div className="animate-gradient-pan bg-gradient-to-l from-gold-300 via-brand-300 to-gold-300 bg-[length:200%_auto] bg-clip-text text-6xl font-black text-transparent md:text-7xl">
                      {t(`landing.stat${i}Value`)}
                    </div>
                    <p className="mt-3 text-sm font-bold leading-relaxed text-white/70">
                      {t(`landing.stat${i}Label`)}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* دعوة الهوية التجارية */}
        <section className="px-6 pb-24">
          <Reveal>
            <div className="grain relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 px-8 py-16 text-center sm:px-16">
              <div className="pointer-events-none absolute start-1/2 top-0 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-gold-400/20 blur-3xl" />
              <h2 className="relative mx-auto mb-4 max-w-2xl text-3xl font-black leading-tight text-white md:text-5xl">
                {t("landing.brandCtaTitle")}
              </h2>
              <p className="relative mx-auto mb-8 max-w-xl text-brand-100/80">
                {t("landing.brandCtaBody")}
              </p>
              <Link to="/register" className="btn-gold group relative">
                {t("landing.ctaOwner")}
                {ArrowIcon}
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-brand-900/10 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <Logo size={30} />
          <div className="flex items-center gap-6 text-sm font-bold text-brand-900/50">
            <Link to="/privacy" className="transition hover:text-brand-700">
              {t("privacy.title")}
            </Link>
            <Link to="/login" className="transition hover:text-brand-700">
              {t("landing.ctaLogin")}
            </Link>
          </div>
          <p className="text-sm text-brand-900/40">
            {t("common.appName")} — {t("common.tagline")}
          </p>
        </div>
      </footer>
    </div>
  );
}

// كتل ضبابية تنجرف ببطء خلف الصفحة كلها.
function BackgroundOrbs() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] overflow-hidden">
      <div className="absolute -top-48 start-1/2 h-[560px] w-[560px] -translate-x-1/2 animate-orb-drift rounded-full bg-brand-200/50 blur-3xl" />
      <div className="absolute top-16 start-[8%] h-72 w-72 animate-orb-drift rounded-full bg-gold-200/50 blur-3xl [animation-delay:4s]" />
      <div className="absolute end-[5%] top-64 h-56 w-56 animate-orb-drift rounded-full bg-brand-300/30 blur-3xl [animation-delay:8s]" />
    </div>
  );
}

// معاينة حيّة لتذكرة الطابور — رقم الخدمة يتقدّم تلقائيًا لعرض المنتج بحركة.
function LiveTicketPreview() {
  const { t } = useTranslation();
  const [serving, setServing] = useState(14);
  const myNumber = 18;

  useEffect(() => {
    const id = setInterval(() => {
      setServing((n) => (n >= myNumber - 1 ? 14 : n + 1));
    }, 2200);
    return () => clearInterval(id);
  }, []);

  const ahead = myNumber - serving - 1;
  const progress = ((serving - 13) / (myNumber - 14)) * 100;

  return (
    <div className="relative mx-auto max-w-sm">
      <div className="absolute inset-0 -z-10 translate-y-6 rounded-[2.5rem] bg-gradient-to-br from-brand-400/40 to-gold-400/40 blur-2xl" />
      <div className="overflow-hidden rounded-[2rem] bg-white shadow-soft ring-1 ring-brand-900/5">
        <div className="grain relative bg-gradient-to-br from-brand-700 to-brand-950 px-6 pb-8 pt-7 text-center">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="h-36 w-36 animate-ring-expand rounded-full border-2 border-gold-400/60" />
          </div>
          <div className="relative text-[11px] font-extrabold uppercase tracking-[0.3em] text-white/60">
            {t("queue.yourNumber")}
          </div>
          <div className="relative my-1 text-7xl font-black text-white">{myNumber}</div>
          <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-gold-200 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-400" />
            {t("queue.connected")}
          </span>
        </div>
        <div className="px-6 py-5">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-slate-400">
            <span>{t("queue.trackStart")}</span>
            <span>{t("queue.trackEnd")}</span>
          </div>
          <div className="relative mb-5 h-2.5 rounded-full bg-brand-50">
            <div
              className="absolute inset-y-0 start-0 rounded-full bg-gradient-to-l from-gold-400 to-brand-500 transition-all duration-1000 ease-out"
              style={{ width: `${Math.max(8, progress)}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl bg-brand-50 py-3">
              <div className="text-[11px] font-bold text-brand-600">
                {t("dashboard.currentServing")}
              </div>
              <div key={serving} className="animate-pop-in text-3xl font-black text-brand-700">
                {serving}
              </div>
            </div>
            <div className="rounded-2xl bg-gold-50 py-3">
              <div className="text-[11px] font-bold text-gold-600">
                {t("queue.peopleAhead")}
              </div>
              <div className="text-3xl font-black text-gold-500">{ahead}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShopTypesMarquee() {
  const { t } = useTranslation();
  const items = ["barber", "restaurant", "clinic", "salon", "other"].map((type) =>
    t(`dashboard.shopTypes.${type}`),
  );
  // نكرر القائمة مرتين داخل شريط واحد لتحقيق حلقة لا نهائية سلسة.
  const row = [...items, ...items, ...items];
  return (
    <section className="grain relative overflow-hidden bg-brand-950 py-6" dir="ltr">
      <span className="sr-only">{t("landing.marqueeTitle")}</span>
      <div className="marquee-mask flex w-max animate-marquee gap-10">
        {[...row, ...row].map((label, i) => (
          <span
            key={i}
            className="flex shrink-0 items-center gap-10 text-2xl font-black tracking-tight text-white/80 md:text-3xl"
          >
            {label}
            <svg width={14} height={14} viewBox="0 0 24 24" className="text-gold-400" fill="currentColor">
              <path d="M12 0l2.8 9.2L24 12l-9.2 2.8L12 24l-2.8-9.2L0 12l9.2-2.8z" />
            </svg>
          </span>
        ))}
      </div>
    </section>
  );
}

function FeatureCard({
  index,
  icon,
  title,
  body,
}: {
  index: number;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="card group relative h-full overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_24px_50px_-20px_theme(colors.brand.700/35%)]">
      <div className="pointer-events-none absolute -end-6 -top-8 text-8xl font-black text-brand-900/[0.04] transition-colors duration-300 group-hover:text-gold-400/15">
        {String(index + 1).padStart(2, "0")}
      </div>
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-soft transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110">
        <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          {icon}
        </svg>
      </div>
      <h3 className="mb-2 text-xl font-black text-brand-900">{title}</h3>
      <p className="text-sm leading-relaxed text-brand-900/55">{body}</p>
    </div>
  );
}
