import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { ar } from "./ar";
import { en } from "./en";
import { ur } from "./ur";
import { hi } from "./hi";
import { bn } from "./bn";
import { tl } from "./tl";
import { id } from "./id";
import { am } from "./am";

// 8 لغات مستهدفة لسكان السعودية (خطة المنتج).
export const SUPPORTED_LANGUAGES = [
  { code: "ar", label: "العربية", dir: "rtl" as const },
  { code: "en", label: "English", dir: "ltr" as const },
  { code: "ur", label: "اردو", dir: "rtl" as const },
  { code: "hi", label: "हिन्दी", dir: "ltr" as const },
  { code: "bn", label: "বাংলা", dir: "ltr" as const },
  { code: "tl", label: "Filipino", dir: "ltr" as const },
  { code: "id", label: "Indonesia", dir: "ltr" as const },
  { code: "am", label: "አማርኛ", dir: "ltr" as const },
];

export const RTL_LANGUAGES = new Set(["ar", "ur"]);

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ar: { translation: ar },
      en: { translation: en },
      ur: { translation: ur },
      hi: { translation: hi },
      bn: { translation: bn },
      tl: { translation: tl },
      id: { translation: id },
      am: { translation: am },
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
  const base = lng.split("-")[0];
  const dir = RTL_LANGUAGES.has(base) ? "rtl" : "ltr";
  document.documentElement.setAttribute("dir", dir);
  document.documentElement.setAttribute("lang", base);
}

i18n.on("languageChanged", applyDir);
applyDir(i18n.language || "ar");

export default i18n;
