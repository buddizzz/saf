import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { ar } from "./ar";
import { en } from "./en";

// اللغات المستهدفة (MVP يبدأ بالعربية والإنجليزية، والبنية تدعم إضافة الباقي).
export const SUPPORTED_LANGUAGES = [
  { code: "ar", label: "العربية", dir: "rtl" as const },
  { code: "en", label: "English", dir: "ltr" as const },
];

export const RTL_LANGUAGES = new Set(["ar", "ur"]);

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ar: { translation: ar },
      en: { translation: en },
    },
    fallbackLng: "ar",
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export function applyDir(lng: string) {
  const dir = RTL_LANGUAGES.has(lng) ? "rtl" : "ltr";
  document.documentElement.setAttribute("dir", dir);
  document.documentElement.setAttribute("lang", lng);
}

i18n.on("languageChanged", applyDir);
applyDir(i18n.language || "ar");

export default i18n;
