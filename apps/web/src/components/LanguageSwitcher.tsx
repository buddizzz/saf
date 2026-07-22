import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "../i18n";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  return (
    <div className="flex items-center gap-1 rounded-full border border-brand-100 bg-white p-1 text-sm">
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          onClick={() => void i18n.changeLanguage(lang.code)}
          className={`rounded-full px-3 py-1 font-bold transition ${
            i18n.language === lang.code
              ? "bg-brand-600 text-white"
              : "text-brand-700 hover:bg-brand-50"
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
