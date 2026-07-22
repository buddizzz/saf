// خمسة قوالب تصميم جاهزة لصفحة العميل. كل قالب مجموعة ألوان تُطبّق
// عبر متغيّرات CSS، مع إمكانية دمج تخصيص المالك (theme_custom) فوقها.

export interface Theme {
  id: string;
  nameAr: string;
  nameEn: string;
  primary: string;
  primaryDark: string;
  accent: string;
  surface: string;
  bg: string;
}

export const THEMES: Theme[] = [
  {
    id: "modern",
    nameAr: "عصري",
    nameEn: "Modern",
    primary: "#1f6675",
    primaryDark: "#183b45",
    accent: "#e0a24e",
    surface: "#ffffff",
    bg: "#f1f6f7",
  },
  {
    id: "warm",
    nameAr: "دافئ",
    nameEn: "Warm",
    primary: "#b45309",
    primaryDark: "#7c2d12",
    accent: "#f59e0b",
    surface: "#fffdf8",
    bg: "#fdf6ec",
  },
  {
    id: "professional",
    nameAr: "احترافي",
    nameEn: "Professional",
    primary: "#1e3a8a",
    primaryDark: "#172554",
    accent: "#3b82f6",
    surface: "#ffffff",
    bg: "#eef2ff",
  },
  {
    id: "elegant",
    nameAr: "أنيق",
    nameEn: "Elegant",
    primary: "#5b21b6",
    primaryDark: "#3b0764",
    accent: "#a78bfa",
    surface: "#fffbff",
    bg: "#f5f0fb",
  },
  {
    id: "fresh",
    nameAr: "منعش",
    nameEn: "Fresh",
    primary: "#047857",
    primaryDark: "#064e3b",
    accent: "#34d399",
    surface: "#ffffff",
    bg: "#ecfdf5",
  },
];

export function getTheme(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

// يدمج القالب المختار مع تخصيص المالك للهوية التجارية (theme_custom) إن وُجد.
export function resolveShopTheme(shop: {
  theme_id: string;
  theme_custom: string | null;
}): Theme {
  const base = getTheme(shop.theme_id);
  if (!shop.theme_custom) return base;
  try {
    return { ...base, ...(JSON.parse(shop.theme_custom) as Partial<Theme>) };
  } catch {
    return base;
  }
}

// يحوّل القالب إلى متغيّرات CSS تُطبَّق على عنصر الغلاف.
export function themeVars(theme: Theme): Record<string, string> {
  return {
    "--saf-primary": theme.primary,
    "--saf-primary-dark": theme.primaryDark,
    "--saf-accent": theme.accent,
    "--saf-surface": theme.surface,
    "--saf-bg": theme.bg,
  } as Record<string, string>;
}
