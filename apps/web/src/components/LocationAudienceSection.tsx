import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../lib/api";
import { readDeviceCoords } from "../lib/geo";
import type { Shop } from "../lib/types";

interface VisitSummary {
  summary: {
    unique_visitors: number;
    total_visits: number;
    marketing_opted_in: number;
  } | null;
  by_age: Array<{ age_category: string; n: number }>;
}

interface AudiencePreview {
  type: string;
  count: number;
  customers: Array<{
    name: string | null;
    gender: string | null;
    age_category: string | null;
    visit_count?: number;
    last_visit_at?: number;
  }>;
}

export function LocationAudienceSection({
  shop,
  onChange,
}: {
  shop: Shop;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [visits, setVisits] = useState<VisitSummary | null>(null);
  const [audience, setAudience] = useState<AudiencePreview | null>(null);

  const loadVisits = useCallback(async () => {
    const res = await apiFetch<VisitSummary>(`/shops/${shop.id}/visits`, {
      auth: true,
    });
    setVisits(res);
  }, [shop.id]);

  useEffect(() => {
    void loadVisits();
  }, [loadVisits]);

  const refreshGps = async () => {
    setBusy(true);
    setGeoStatus(t("location.locating"));
    try {
      const coords = await readDeviceCoords();
      await apiFetch(`/shops/${shop.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({
          lat: coords?.lat ?? undefined,
          lng: coords?.lng ?? undefined,
          city_id: shop.city_id ?? undefined,
          district_id: shop.district_id ?? undefined,
          refresh_location: true,
        }),
      });
      setGeoStatus(
        coords ? t("location.gpsSaved") : t("location.osmFallback"),
      );
      onChange();
    } catch (err) {
      setGeoStatus(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  };

  const previewAudience = async (type: "past_customers" | "new_in_area") => {
    const res = await apiFetch<AudiencePreview>(
      `/shops/${shop.id}/audience?type=${type}&limit=20`,
      { auth: true },
    );
    setAudience(res);
  };

  return (
    <div className="card space-y-4">
      <div>
        <h3 className="font-extrabold text-brand-800">{t("location.title")}</h3>
        <p className="mt-1 text-sm text-slate-500">{t("location.subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-brand-50 px-3 py-2 text-sm">
          <div className="text-xs font-bold text-brand-600">
            {t("location.coords")}
          </div>
          <div className="font-mono font-bold text-brand-800" dir="ltr">
            {shop.lat != null && shop.lng != null
              ? `${shop.lat.toFixed(5)}, ${shop.lng.toFixed(5)}`
              : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {shop.location_source
              ? t(`location.source.${shop.location_source}`)
              : t("location.source.none")}
          </div>
        </div>
        <div className="rounded-xl bg-brand-50 px-3 py-2 text-sm">
          <div className="text-xs font-bold text-brand-600">
            {t("location.osm")}
          </div>
          <div className="font-bold text-brand-800">
            {shop.osm_display_name ?? "—"}
          </div>
        </div>
      </div>

      <button className="btn-ghost" disabled={busy} onClick={() => void refreshGps()}>
        {busy ? t("common.loading") : t("location.refreshGps")}
      </button>
      {geoStatus && <p className="text-sm font-bold text-brand-700">{geoStatus}</p>}

      <div className="border-t border-slate-100 pt-4">
        <h4 className="mb-2 font-extrabold text-brand-800">
          {t("location.visitsTitle")}
        </h4>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 py-2">
            <div className="text-lg font-extrabold text-brand-800">
              {visits?.summary?.unique_visitors ?? 0}
            </div>
            <div className="text-[11px] text-slate-500">
              {t("location.uniqueVisitors")}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 py-2">
            <div className="text-lg font-extrabold text-brand-800">
              {visits?.summary?.total_visits ?? 0}
            </div>
            <div className="text-[11px] text-slate-500">
              {t("location.totalVisits")}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 py-2">
            <div className="text-lg font-extrabold text-brand-800">
              {visits?.summary?.marketing_opted_in ?? 0}
            </div>
            <div className="text-[11px] text-slate-500">
              {t("location.marketingOptIn")}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="btn-ghost"
          onClick={() => void previewAudience("past_customers")}
        >
          {t("location.previewPast")}
        </button>
        <button
          className="btn-ghost"
          onClick={() => void previewAudience("new_in_area")}
        >
          {t("location.previewArea")}
        </button>
      </div>

      {audience && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
          <div className="mb-2 font-bold text-brand-800">
            {audience.type === "new_in_area"
              ? t("location.previewArea")
              : t("location.previewPast")}{" "}
            · {audience.count}
          </div>
          <p className="mb-2 text-xs text-slate-500">{t("location.privacyNote")}</p>
          <ul className="max-h-40 space-y-1 overflow-auto">
            {audience.customers.map((c, i) => (
              <li key={`${c.name}-${i}`} className="text-slate-700">
                {c.name ?? "—"}
                {c.age_category ? ` · ${c.age_category}` : ""}
                {c.visit_count != null ? ` · ×${c.visit_count}` : ""}
              </li>
            ))}
            {audience.customers.length === 0 && (
              <li className="text-slate-400">{t("location.noAudience")}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
