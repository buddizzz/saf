import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Logo } from "../components/Logo";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

export function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Link to="/">
          <Logo />
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-6 animate-fade-in text-4xl font-black tracking-tight text-brand-950">
          {t("privacy.title")}
        </h1>
        <div className="card">
          <p className="text-lg leading-loose text-slate-700">
            {t("privacy.body")}
          </p>
        </div>
        <Link
          to="/"
          className="mt-6 inline-block font-bold text-brand-600 hover:underline"
        >
          ← {t("privacy.backHome")}
        </Link>
      </main>
    </div>
  );
}
