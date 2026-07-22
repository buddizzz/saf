import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "../i18n";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = (i18n.language || "ar").split("-")[0];

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">Language</span>
      <select
        className="rounded-xl border border-brand-100 bg-white px-3 py-1.5 font-bold text-brand-800 shadow-sm"
        value={current}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        aria-label="Language"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </label>
  );
}
