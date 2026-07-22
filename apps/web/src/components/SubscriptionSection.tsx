import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../lib/api";
import type { Shop } from "../lib/types";

interface SubInfo {
  shop: {
    id: string;
    subscription_tier: string;
    subscription_status: string;
    subscription_renews_at: number | null;
    hide_powered_by: number;
    is_pro: boolean;
  };
  subscription: {
    id: string;
    plan: string;
    status: string;
    provider: string;
    current_period_end: number;
    cancel_at_period_end?: number;
  } | null;
  pricing: {
    monthly_sar: number;
    yearly_sar: number;
    trial_days: number;
    reminder_quota: number;
  };
}

function formatDate(unix: number | null | undefined, locale: string) {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SubscriptionSection({
  shop,
  onChange,
}: {
  shop: Shop;
  onChange: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [info, setInfo] = useState<SubInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<"pro_monthly" | "pro_yearly">("pro_monthly");
  const [slug, setSlug] = useState(shop.slug);
  const [slugMsg, setSlugMsg] = useState<string | null>(null);
  const [hidePowered, setHidePowered] = useState(shop.hide_powered_by === 1);

  const load = useCallback(async () => {
    const res = await apiFetch<SubInfo>(`/shops/${shop.id}/subscription`, {
      auth: true,
    });
    setInfo(res);
  }, [shop.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSlug(shop.slug);
    setHidePowered(shop.hide_powered_by === 1);
  }, [shop.slug, shop.hide_powered_by]);

  const start = async (mode: "trial" | "activate") => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/shops/${shop.id}/subscription`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ plan, mode }),
      });
      await load();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/shops/${shop.id}/subscription/cancel`, {
        method: "POST",
        auth: true,
        body: "{}",
      });
      await load();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  };

  const saveSlug = async (e: FormEvent) => {
    e.preventDefault();
    setSlugMsg(null);
    setError(null);
    try {
      await apiFetch(`/shops/${shop.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ slug }),
      });
      setSlugMsg(t("subscription.slugSaved"));
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    }
  };

  const togglePowered = async (next: boolean) => {
    setHidePowered(next);
    await apiFetch(`/shops/${shop.id}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ hide_powered_by: next }),
    });
    onChange();
  };

  const isPro = info?.shop.is_pro ?? shop.subscription_tier === "pro";
  const locale = i18n.language === "ar" ? "ar-SA" : "en-US";

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-brand-800">
            {t("subscription.title")}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {t("subscription.subtitle")}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-extrabold ${
            isPro
              ? "bg-gradient-to-l from-gold-400 to-gold-500 text-brand-900"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {isPro ? t("subscription.proBadge") : t("subscription.freeBadge")}
        </span>
      </div>

      {info && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-brand-50 px-3 py-2">
            <div className="text-xs font-bold text-brand-600">
              {t("subscription.status")}
            </div>
            <div className="font-extrabold text-brand-800">
              {info.shop.subscription_status}
            </div>
          </div>
          <div className="rounded-xl bg-brand-50 px-3 py-2">
            <div className="text-xs font-bold text-brand-600">
              {t("subscription.renews")}
            </div>
            <div className="font-extrabold text-brand-800">
              {formatDate(info.shop.subscription_renews_at, locale)}
            </div>
          </div>
          <div className="rounded-xl bg-brand-50 px-3 py-2">
            <div className="text-xs font-bold text-brand-600">
              {t("subscription.price")}
            </div>
            <div className="font-extrabold text-brand-800">
              {info.pricing.monthly_sar} / {info.pricing.yearly_sar}{" "}
              {t("subscription.sar")}
            </div>
          </div>
        </div>
      )}

      {!isPro && (
        <div className="space-y-3 rounded-xl border border-gold-200 bg-gradient-to-br from-gold-50 to-white p-4">
          <p className="text-sm font-bold text-brand-800">
            {t("subscription.upgradePitch")}
          </p>
          <ul className="space-y-1 text-sm text-slate-600">
            <li>• {t("subscription.featBooking")}</li>
            <li>• {t("subscription.featThemes")}</li>
            <li>• {t("subscription.featSlug")}</li>
            <li>• {t("subscription.featAds")}</li>
            <li>• {t("subscription.featStaff")}</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
              <input
                type="radio"
                checked={plan === "pro_monthly"}
                onChange={() => setPlan("pro_monthly")}
              />
              {t("subscription.monthly")} · {info?.pricing.monthly_sar ?? 89}{" "}
              {t("subscription.sar")}
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
              <input
                type="radio"
                checked={plan === "pro_yearly"}
                onChange={() => setPlan("pro_yearly")}
              />
              {t("subscription.yearly")} · {info?.pricing.yearly_sar ?? 828}{" "}
              {t("subscription.sar")}
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-gold"
              disabled={busy}
              onClick={() => void start("trial")}
            >
              {t("subscription.startTrial")}
            </button>
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => void start("activate")}
            >
              {t("subscription.activate")}
            </button>
          </div>
          <p className="text-xs text-slate-400">{t("subscription.mvpNote")}</p>
        </div>
      )}

      {isPro && (
        <div className="space-y-4">
          <form onSubmit={saveSlug} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <label className="label">{t("subscription.customSlug")}</label>
              <div className="flex items-center gap-1" dir="ltr">
                <span className="text-sm text-slate-400">/q/</span>
                <input
                  className="field"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  pattern="[a-z0-9][a-z0-9-]{1,28}[a-z0-9]"
                  required
                />
              </div>
            </div>
            <button className="btn-primary">{t("common.save")}</button>
          </form>
          {slugMsg && (
            <p className="text-sm font-bold text-emerald-600">{slugMsg}</p>
          )}

          <label className="flex items-center gap-2 text-sm font-bold text-brand-800">
            <input
              type="checkbox"
              checked={hidePowered}
              onChange={(e) => void togglePowered(e.target.checked)}
            />
            {t("subscription.hidePowered")}
          </label>

          {info?.shop.subscription_status !== "cancelled" && (
            <button
              className="btn-ghost text-rose-600"
              disabled={busy}
              onClick={() => void cancel()}
            >
              {t("subscription.cancel")}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
    </div>
  );
}
