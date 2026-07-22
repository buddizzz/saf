import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Logo } from "../components/Logo";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

const FEATURE_ICONS = [
  // نبضة لحظية (طابور مباشر)
  <path
    key="pulse"
    d="M3 12h4l2-6 4 12 2-6h6"
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
  // رمز QR
  <>
    <rect key="qr-1" x="3" y="3" width="7" height="7" rx="1.5" />
    <rect key="qr-2" x="14" y="3" width="7" height="7" rx="1.5" />
    <rect key="qr-3" x="3" y="14" width="7" height="7" rx="1.5" />
    <path key="qr-4" d="M14 14h3v3h-3zM19 19h2M14 21h2M19 14v2" strokeLinecap="round" />
  </>,
  // جرس تنبيه
  <path
    key="bell"
    d="M12 3a5 5 0 0 0-5 5v3.5c0 .8-.3 1.6-.9 2.1L5 15h14l-1.1-1.4a3 3 0 0 1-.9-2.1V8a5 5 0 0 0-5-5ZM9.5 18a2.5 2.5 0 0 0 5 0"
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
];

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="card group hover:-translate-y-1 hover:shadow-[0_20px_45px_-18px_theme(colors.brand.700/35%)]">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-soft transition-transform group-hover:scale-105">
        <svg
          width={24}
          height={24}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          {icon}
        </svg>
      </div>
      <h3 className="mb-2 text-lg font-extrabold text-brand-700">{title}</h3>
      <p className="text-sm leading-relaxed text-slate-600">{body}</p>
    </div>
  );
}

const ArrowIcon = (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
    className="rtl:rotate-180"
  >
    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function LandingPage() {
  const { t } = useTranslation();
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* خلفية زخرفية متدرجة */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] overflow-hidden">
        <div className="absolute -top-40 start-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-brand-200/50 blur-3xl" />
        <div className="absolute top-10 start-[10%] h-64 w-64 rounded-full bg-gold-200/60 blur-3xl" />
      </div>

      <header className="sticky top-0 z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-5 backdrop-blur-sm">
        <Logo />
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link to="/login" className="btn-ghost hidden sm:inline-flex">
            {t("landing.ctaLogin")}
          </Link>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6">
        <section className="grid items-center gap-10 py-12 md:grid-cols-2 md:py-20">
          <div className="animate-fade-in">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-4 py-1.5 text-sm font-bold text-gold-700 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />
                {t("common.tagline")}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-800 py-1 pe-3 ps-1.5 text-xs font-bold text-white shadow-sm">
                <span className="rounded-full bg-gold-400 px-2 py-0.5 text-[10px] font-extrabold text-brand-900">
                  {t("landing.newBadgeTag")}
                </span>
                {t("landing.newBadgeText")}
              </span>
            </div>
            <h1 className="mb-5 text-4xl font-extrabold leading-tight tracking-tight text-brand-800 md:text-5xl">
              {t("landing.heroTitle")}
            </h1>
            <p className="mb-8 max-w-lg text-lg leading-relaxed text-slate-600">
              {t("landing.heroSubtitle")}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/register" className="btn-primary">
                {t("landing.ctaOwner")}
                {ArrowIcon}
              </Link>
              <Link to="/login" className="btn-ghost">
                {t("landing.ctaLogin")}
              </Link>
            </div>
          </div>
          <div className="relative animate-scale-in">
            <div className="absolute inset-0 -z-10 rounded-[2.5rem] bg-gradient-to-br from-brand-400 to-gold-400 opacity-40 blur-2xl" />
            <div className="mx-auto flex aspect-square max-w-sm items-center justify-center rounded-[2.5rem] bg-gradient-to-br from-brand-600 to-brand-800 shadow-soft ring-1 ring-white/10">
              <Logo size={180} showWordmark={false} />
            </div>
          </div>
        </section>

        <section className="grid gap-5 pb-20 md:grid-cols-3">
          <Feature
            icon={FEATURE_ICONS[0]}
            title={t("landing.feature1Title")}
            body={t("landing.feature1Body")}
          />
          <Feature
            icon={FEATURE_ICONS[1]}
            title={t("landing.feature2Title")}
            body={t("landing.feature2Body")}
          />
          <Feature
            icon={FEATURE_ICONS[2]}
            title={t("landing.feature3Title")}
            body={t("landing.feature3Body")}
          />
        </section>

        <section className="pb-20">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 px-6 py-14 shadow-soft sm:px-12">
            <div className="pointer-events-none absolute -end-16 -top-16 h-56 w-56 rounded-full bg-gold-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -start-10 bottom-0 h-48 w-48 rounded-full bg-brand-400/30 blur-3xl" />
            <div className="relative mb-10 text-center">
              <h2 className="text-2xl font-extrabold text-white md:text-3xl">
                {t("landing.statsTitle")}
              </h2>
            </div>
            <div className="relative grid gap-4 sm:grid-cols-3">
              <StatCard value={t("landing.stat1Value")} label={t("landing.stat1Label")} />
              <StatCard value={t("landing.stat2Value")} label={t("landing.stat2Label")} />
              <StatCard value={t("landing.stat3Value")} label={t("landing.stat3Label")} />
            </div>
          </div>
        </section>

        <section className="pb-20">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 px-8 py-12 text-center shadow-soft sm:px-16">
            <h2 className="mb-3 text-2xl font-extrabold text-white md:text-3xl">
              {t("landing.brandCtaTitle")}
            </h2>
            <p className="mx-auto mb-6 max-w-xl text-brand-100">
              {t("landing.brandCtaBody")}
            </p>
            <Link to="/register" className="btn-gold">
              {t("landing.ctaOwner")}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-100 py-8 text-center text-sm text-slate-400">
        صفّ — {t("common.tagline")}
      </footer>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-gold-50 px-6 py-6 text-center shadow-soft">
      <div className="bg-gradient-to-br from-brand-700 to-brand-500 bg-clip-text text-4xl font-black text-transparent md:text-5xl">
        {value}
      </div>
      <div className="mt-2 text-sm font-bold text-brand-800">{label}</div>
    </div>
  );
}
