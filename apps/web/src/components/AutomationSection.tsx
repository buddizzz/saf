import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../lib/api";
import type { Shop } from "../lib/types";

type AutomationKind = "winback" | "vip" | "referral";

interface AutomationConfig {
  days?: number;
  min_visits?: number;
  message?: string;
}

interface AutomationInfo {
  automation: AutomationKind;
  enabled: boolean;
  config: AutomationConfig;
  defaults: AutomationConfig & { message: string };
  interval_days: number;
}

interface AutomationsResponse {
  automations: AutomationInfo[];
  reminder_quota: number;
  reminder_quota_used: number;
}

const KIND_ICONS: Record<AutomationKind, string> = {
  winback: "🔁",
  vip: "👑",
  referral: "🤝",
};

/**
 * التسويق التلقائي — مرحلة «بعد الشراء» من خطة التسويق من صفحة واحدة:
 * عملاء دائمون (winback) + رفع القيمة (vip) + توصيات (referral).
 */
export function AutomationSection({ shop }: { shop: Shop }) {
  const { t } = useTranslation();
  const isPro = shop.subscription_tier === "pro";
  const [autos, setAutos] = useState<AutomationInfo[]>([]);
  const [quotaUsed, setQuotaUsed] = useState(0);
  const [quota, setQuota] = useState(400);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch<AutomationsResponse>(
      `/shops/${shop.id}/automations`,
      { auth: true },
    );
    setAutos(res.automations);
    setQuotaUsed(res.reminder_quota_used);
    setQuota(res.reminder_quota);
  }, [shop.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="card space-y-4">
      <div>
        <h3 className="font-extrabold text-brand-800">
          {t("automations.title")}
        </h3>
        <p className="mt-1 text-sm text-slate-500">{t("automations.subtitle")}</p>
      </div>

      <ol className="space-y-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
        <li>① {t("automations.phaseBefore")}</li>
        <li>② {t("automations.phaseDuring")}</li>
        <li className="font-bold text-brand-700">
          ③ {t("automations.phaseAfter")}
        </li>
      </ol>

      {!isPro ? (
        <p className="text-sm text-slate-500">{t("automations.proOnly")}</p>
      ) : (
        <>
          <p className="text-xs text-slate-400">
            {t("automations.quotaHint", { used: quotaUsed, quota })}
          </p>
          {autos.map((auto) => (
            <AutomationCard
              key={auto.automation}
              shopId={shop.id}
              info={auto}
              onError={setError}
              onSaved={load}
            />
          ))}
          {error && (
            <p className="text-sm font-bold text-rose-600">{error}</p>
          )}
        </>
      )}
    </div>
  );
}

function AutomationCard({
  shopId,
  info,
  onError,
  onSaved,
}: {
  shopId: string;
  info: AutomationInfo;
  onError: (msg: string | null) => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const kind = info.automation;
  const [enabled, setEnabled] = useState(info.enabled);
  const [days, setDays] = useState(
    String(info.config.days ?? info.defaults.days ?? 30),
  );
  const [minVisits, setMinVisits] = useState(
    String(info.config.min_visits ?? info.defaults.min_visits ?? 3),
  );
  const [message, setMessage] = useState(
    info.config.message ?? info.defaults.message,
  );
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEnabled(info.enabled);
  }, [info.enabled]);

  const save = async (nextEnabled: boolean) => {
    setBusy(true);
    onError(null);
    try {
      await apiFetch(`/shops/${shopId}/automations/${kind}`, {
        method: "PUT",
        auth: true,
        body: JSON.stringify({
          enabled: nextEnabled,
          days: kind === "winback" ? Number(days) : undefined,
          min_visits: kind === "vip" ? Number(minVisits) : undefined,
          message,
        }),
      });
      setEnabled(nextEnabled);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`rounded-xl border-2 p-4 transition ${
        enabled ? "border-brand-300 bg-brand-50/40" : "border-slate-100"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="flex-1 text-right"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="font-extrabold text-brand-800">
            {KIND_ICONS[kind]} {t(`automations.${kind}Title`)}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {t(`automations.${kind}Desc`)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {t("automations.runsEvery", { days: info.interval_days })}
          </p>
        </button>
        <label className="flex shrink-0 items-center gap-2 text-xs font-bold">
          <span className={enabled ? "text-emerald-600" : "text-slate-400"}>
            {enabled ? t("automations.enabled") : t("automations.disabled")}
          </span>
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => void save(e.target.checked)}
          />
        </label>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          {kind === "winback" && (
            <label className="block text-sm">
              <span className="mb-1 block font-bold text-slate-600">
                {t("automations.winbackDays")}
              </span>
              <input
                className="field !w-28"
                type="number"
                min={7}
                max={365}
                dir="ltr"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </label>
          )}
          {kind === "vip" && (
            <label className="block text-sm">
              <span className="mb-1 block font-bold text-slate-600">
                {t("automations.vipMinVisits")}
              </span>
              <input
                className="field !w-28"
                type="number"
                min={2}
                max={50}
                dir="ltr"
                value={minVisits}
                onChange={(e) => setMinVisits(e.target.value)}
              />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-bold text-slate-600">
              {t("automations.message")}
            </span>
            <textarea
              className="field min-h-[90px]"
              value={message}
              maxLength={1000}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => void save(enabled)}
          >
            {saved ? t("automations.saved") : t("common.save")}
          </button>
        </div>
      )}
    </div>
  );
}
