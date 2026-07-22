import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, apiUpload, assetUrl } from "../lib/api";
import { darken, isValidHex } from "../lib/color";
import { resolveShopTheme } from "../themes";
import type { Shop } from "../lib/types";

interface CustomColors {
  primary?: string;
  primaryDark?: string;
  accent?: string;
}

function parseCustom(shop: Shop): CustomColors {
  if (!shop.theme_custom) return {};
  try {
    return JSON.parse(shop.theme_custom) as CustomColors;
  } catch {
    return {};
  }
}

export function BrandIdentitySection({
  shop,
  onChange,
}: {
  shop: Shop;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const baseTheme = resolveShopTheme(shop);
  const custom = parseCustom(shop);
  const hasCustomColors = Boolean(shop.theme_custom);

  const [primary, setPrimary] = useState(custom.primary ?? baseTheme.primary);
  const [accent, setAccent] = useState(custom.accent ?? baseTheme.accent);
  const [tagline, setTagline] = useState(shop.tagline ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPrimary(custom.primary ?? baseTheme.primary);
    setAccent(custom.accent ?? baseTheme.accent);
    setTagline(shop.tagline ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop.id, shop.theme_id, shop.theme_custom, shop.tagline]);

  const logoSrc = assetUrl(shop.logo_url);
  const previewDark = darken(primary, 0.35);

  const onPickFile = () => fileInputRef.current?.click();

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      await apiUpload(`/shops/${shop.id}/logo`, file);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر رفع الشعار");
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = async () => {
    setUploading(true);
    try {
      await apiFetch(`/shops/${shop.id}/logo`, { method: "DELETE", auth: true });
      onChange();
    } finally {
      setUploading(false);
    }
  };

  const saveColors = async () => {
    if (!isValidHex(primary) || !isValidHex(accent)) {
      setError(t("settings.brand.invalidColor"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/shops/${shop.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({
          theme_custom: { primary, primaryDark: previewDark, accent },
          tagline,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSaving(false);
    }
  };

  const resetColors = async () => {
    setSaving(true);
    try {
      await apiFetch(`/shops/${shop.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ theme_custom: null }),
      });
      onChange();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="font-extrabold text-brand-800">
          {t("settings.brand.title")}
        </h3>
        <span className="rounded-full bg-gold-100 px-2.5 py-0.5 text-[11px] font-bold text-gold-700">
          {t("settings.brand.badge")}
        </span>
      </div>
      <p className="mb-4 text-sm text-slate-500">{t("settings.brand.subtitle")}</p>

      <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
        <div className="space-y-5">
          {/* الشعار */}
          <div>
            <label className="label">{t("settings.brand.logo")}</label>
            <div className="flex items-center gap-4">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-xl font-extrabold text-white shadow-soft"
                style={{
                  background: `linear-gradient(135deg, ${primary}, ${previewDark})`,
                }}
              >
                {logoSrc ? (
                  <img
                    src={logoSrc}
                    alt={shop.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  shop.name.charAt(0)
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-ghost !px-3 !py-2 text-sm"
                  onClick={onPickFile}
                  disabled={uploading}
                >
                  {uploading
                    ? t("common.loading")
                    : logoSrc
                      ? t("settings.brand.changeLogo")
                      : t("settings.brand.uploadLogo")}
                </button>
                {logoSrc && (
                  <button
                    type="button"
                    className="text-sm font-bold text-rose-500 hover:underline"
                    onClick={removeLogo}
                    disabled={uploading}
                  >
                    {t("settings.remove")}
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={onFileSelected}
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              {t("settings.brand.logoHint")}
            </p>
          </div>

          {/* الألوان المخصصة */}
          <div>
            <label className="label">{t("settings.brand.colors")}</label>
            <div className="grid grid-cols-2 gap-3">
              <ColorField
                label={t("settings.brand.primaryColor")}
                value={primary}
                onChange={setPrimary}
              />
              <ColorField
                label={t("settings.brand.accentColor")}
                value={accent}
                onChange={setAccent}
              />
            </div>
            {hasCustomColors && (
              <button
                type="button"
                onClick={resetColors}
                className="mt-2 text-xs font-bold text-brand-500 hover:underline"
              >
                {t("settings.brand.resetColors")}
              </button>
            )}
          </div>

          {/* الشعار النصي */}
          <div>
            <label className="label">{t("settings.brand.tagline")}</label>
            <input
              className="field"
              value={tagline}
              maxLength={80}
              placeholder={t("settings.brand.taglinePlaceholder")}
              onChange={(e) => setTagline(e.target.value)}
            />
            <p className="mt-1 text-left text-xs text-slate-400" dir="ltr">
              {tagline.length}/80
            </p>
          </div>

          {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
          <button className="btn-primary" onClick={saveColors} disabled={saving}>
            {saved ? t("settings.saved") : t("common.save")}
          </button>
        </div>

        {/* معاينة مباشرة */}
        <div>
          <label className="label">{t("settings.brand.preview")}</label>
          <div
            className="flex flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center transition-colors"
            style={{ background: `linear-gradient(160deg, ${primary}1a, ${accent}14)` }}
          >
            <div
              className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl text-2xl font-extrabold text-white shadow-soft"
              style={{ background: `linear-gradient(135deg, ${primary}, ${previewDark})` }}
            >
              {logoSrc ? (
                <img src={logoSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                shop.name.charAt(0)
              )}
            </div>
            <div>
              <div className="text-lg font-extrabold" style={{ color: previewDark }}>
                {shop.name}
              </div>
              {tagline && (
                <div className="mt-0.5 text-sm font-medium opacity-80" style={{ color: previewDark }}>
                  {tagline}
                </div>
              )}
            </div>
            <span
              className="rounded-full px-4 py-1.5 text-sm font-extrabold text-white shadow-soft"
              style={{ background: accent, color: previewDark }}
            >
              {t("settings.brand.previewCta")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
      <input
        type="color"
        value={isValidHex(value) ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
      />
      <div className="flex-1 overflow-hidden">
        <div className="truncate text-xs font-bold text-brand-700">{label}</div>
        <input
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-xs font-mono text-slate-500 outline-none"
        />
      </div>
    </div>
  );
}
