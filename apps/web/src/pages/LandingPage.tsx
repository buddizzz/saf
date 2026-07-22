import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Logo } from "../components/Logo";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="card">
      <h3 className="mb-2 text-lg font-extrabold text-brand-700">{title}</h3>
      <p className="text-sm leading-relaxed text-slate-600">{body}</p>
    </div>
  );
}

export function LandingPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link to="/login" className="btn-ghost hidden sm:inline-flex">
            {t("landing.ctaLogin")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="grid items-center gap-10 py-12 md:grid-cols-2 md:py-20">
          <div>
            <span className="mb-4 inline-block rounded-full bg-gold-100 px-4 py-1 text-sm font-bold text-gold-700">
              {t("common.tagline")}
            </span>
            <h1 className="mb-5 text-4xl font-extrabold leading-tight text-brand-800 md:text-5xl">
              {t("landing.heroTitle")}
            </h1>
            <p className="mb-8 max-w-lg text-lg leading-relaxed text-slate-600">
              {t("landing.heroSubtitle")}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/register" className="btn-primary">
                {t("landing.ctaOwner")}
              </Link>
              <Link to="/login" className="btn-ghost">
                {t("landing.ctaLogin")}
              </Link>
            </div>
          </div>
          <div className="relative">
            <div className="mx-auto flex aspect-square max-w-sm items-center justify-center rounded-[2.5rem] bg-gradient-to-br from-brand-600 to-brand-800 shadow-soft">
              <Logo size={180} showWordmark={false} />
            </div>
          </div>
        </section>

        <section className="grid gap-5 pb-20 md:grid-cols-3">
          <Feature
            title={t("landing.feature1Title")}
            body={t("landing.feature1Body")}
          />
          <Feature
            title={t("landing.feature2Title")}
            body={t("landing.feature2Body")}
          />
          <Feature
            title={t("landing.feature3Title")}
            body={t("landing.feature3Body")}
          />
        </section>
      </main>

      <footer className="border-t border-slate-100 py-8 text-center text-sm text-slate-400">
        صفّ — {t("common.tagline")}
      </footer>
    </div>
  );
}
