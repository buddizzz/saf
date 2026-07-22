import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, apiFetch } from "../lib/api";
import type { Shop } from "../lib/types";

type AudienceType = "past_customers" | "new_in_area";

interface Campaign {
  id: string;
  name: string;
  audience_type: AudienceType;
  type: string;
  status: string;
  audience_count: number;
  price_per_message: number;
  cost: number;
  scheduled_at: number | null;
  sent_at: number | null;
  rejection_reason: string | null;
  created_at: number;
}

interface Estimate {
  type: AudienceType;
  count: number;
  price_per_message: number;
  estimated_cost: number;
}

const TEMPLATES = [
  {
    id: "discount",
    ar: "مرحباً {اسم} 👋\nعرض خاص من {اسم_المحل}: خصم لفترة محدودة! ننتظر زيارتكم 🌟",
    en: "Hi {name} 👋\nSpecial offer from {shop}: limited-time discount! We can't wait to see you 🌟",
  },
  {
    id: "opening",
    ar: "مرحباً {اسم} 👋\nنفتتح فرعنا الجديد — زوروا {اسم_المحل} قريباً!",
    en: "Hi {name} 👋\nOur new branch is open — visit {shop} soon!",
  },
  {
    id: "missyou",
    ar: "مرحباً {اسم} 👋\nاشتقنا لزيارتك في {اسم_المحل}!\nنتطلع لرؤيتك قريباً 🌟",
    en: "Hi {name} 👋\nWe miss you at {shop}!\nHope to see you soon 🌟",
  },
];

export function CampaignSection({ shop }: { shop: Shop }) {
  const { t, i18n } = useTranslation();
  const isPro = shop.subscription_tier === "pro";
  const [step, setStep] = useState<1 | 2>(1);
  const [audienceType, setAudienceType] =
    useState<AudienceType>("past_customers");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [message, setMessage] = useState(TEMPLATES[2].ar);
  const [name, setName] = useState("");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [balance, setBalance] = useState(0);
  const [reminders, setReminders] = useState(false);
  const [quotaUsed, setQuotaUsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isPro) return;
    const [list, bal, rem] = await Promise.all([
      apiFetch<{ campaigns: Campaign[] }>(`/shops/${shop.id}/campaigns`, {
        auth: true,
      }),
      apiFetch<{ balance: number }>(`/shops/${shop.id}/billing/balance`, {
        auth: true,
      }),
      apiFetch<{
        monthly_reminders_enabled: boolean;
        reminder_quota_used: number;
      }>(`/shops/${shop.id}/campaigns/reminders`, { auth: true }),
    ]);
    setCampaigns(list.campaigns);
    setBalance(bal.balance);
    setReminders(rem.monthly_reminders_enabled);
    setQuotaUsed(rem.reminder_quota_used);
  }, [isPro, shop.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (i18n.language === "en") {
      setMessage(TEMPLATES[2].en);
    } else {
      setMessage(TEMPLATES[2].ar);
    }
  }, [i18n.language]);

  const refreshEstimate = useCallback(async () => {
    if (!isPro) return;
    try {
      const res = await apiFetch<Estimate>(
        `/shops/${shop.id}/campaigns/audience/estimate`,
        {
          method: "POST",
          auth: true,
          body: JSON.stringify({
            audience_type: audienceType,
            gender: gender || undefined,
            age_category: age || undefined,
            city_id: shop.city_id,
            district_id: shop.district_id,
            exclude_existing: true,
          }),
        },
      );
      setEstimate(res);
    } catch (err) {
      setEstimate(null);
      setError(err instanceof Error ? err.message : "estimate failed");
    }
  }, [age, audienceType, gender, isPro, shop.city_id, shop.district_id, shop.id]);

  useEffect(() => {
    if (step === 1 && isPro) void refreshEstimate();
  }, [step, isPro, refreshEstimate]);

  const costLabel = useMemo(() => {
    if (!estimate) return "—";
    return `${estimate.estimated_cost.toFixed(2)} SAR`;
  }, [estimate]);

  if (!isPro) {
    return (
      <div className="card space-y-2">
        <h3 className="font-extrabold text-brand-800">{t("campaigns.title")}</h3>
        <p className="text-sm text-slate-500">{t("campaigns.proOnly")}</p>
      </div>
    );
  }

  const createAndSend = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const created = await apiFetch<{ campaign: Campaign }>(
        `/shops/${shop.id}/campaigns`,
        {
          method: "POST",
          auth: true,
          body: JSON.stringify({
            name: name.trim() || t("campaigns.defaultName"),
            audience_type: audienceType,
            message,
            gender: gender || undefined,
            age_category: age || undefined,
            city_id: shop.city_id,
            district_id: shop.district_id,
            exclude_existing: true,
          }),
        },
      );

      const sent = await apiFetch<{
        status: string;
        message?: string;
        balance?: number;
        error?: string;
        topup_hint?: string;
      }>(`/shops/${shop.id}/campaigns/${created.campaign.id}/send`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({}),
      });

      setStatus(
        sent.status === "pending_review"
          ? t("campaigns.pendingReview")
          : sent.status === "completed"
            ? t("campaigns.sentOk")
            : sent.status === "scheduled"
              ? t("campaigns.scheduledOk")
              : sent.status,
      );
      setStep(1);
      setName("");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error";
      if (err instanceof ApiError && err.status === 402) {
        setError(`${msg} — ${t("campaigns.paymentLater")}`);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const addDevCredit = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{ balance: number }>(
        `/shops/${shop.id}/billing/dev-credit`,
        {
          method: "POST",
          auth: true,
          body: JSON.stringify({ amount: 100 }),
        },
      );
      setBalance(res.balance);
      setStatus(t("campaigns.devCreditOk"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
    } finally {
      setBusy(false);
    }
  };

  const tryTopup = async () => {
    try {
      await apiFetch(`/shops/${shop.id}/billing/topup`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ amount: 100 }),
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("campaigns.paymentLater"),
      );
    }
  };

  const toggleReminders = async () => {
    const next = !reminders;
    setReminders(next);
    await apiFetch(`/shops/${shop.id}/campaigns/reminders/toggle`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ enabled: next }),
    });
  };

  return (
    <div className="card space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-brand-800">{t("campaigns.title")}</h3>
          <p className="mt-1 text-sm text-slate-500">{t("campaigns.subtitle")}</p>
        </div>
        <div className="rounded-xl bg-brand-50 px-3 py-2 text-sm">
          <div className="text-xs font-bold text-brand-600">
            {t("campaigns.balance")}
          </div>
          <div className="font-mono font-extrabold text-brand-800" dir="ltr">
            {balance.toFixed(2)} SAR
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost text-xs" onClick={tryTopup}>
          {t("campaigns.topupSoon")}
        </button>
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={addDevCredit}
          disabled={busy}
        >
          {t("campaigns.devCredit")}
        </button>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
        <span className="font-bold text-brand-800">
          {t("campaigns.reminders")}
          <span className="ms-2 font-normal text-slate-500">
            ({quotaUsed}/400)
          </span>
        </span>
        <input type="checkbox" checked={reminders} onChange={toggleReminders} />
      </label>

      <div className="flex gap-2 text-xs font-bold">
        <span
          className={`rounded-full px-3 py-1 ${
            step === 1 ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          1 · {t("campaigns.stepAudience")}
        </span>
        <span
          className={`rounded-full px-3 py-1 ${
            step === 2 ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          2 · {t("campaigns.stepMessage")}
        </span>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["past_customers", t("campaigns.past")],
                ["new_in_area", t("campaigns.newInArea")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`rounded-xl border-2 px-4 py-3 text-sm font-extrabold ${
                  audienceType === id
                    ? "border-brand-500 bg-brand-50 text-brand-800"
                    : "border-slate-100 text-slate-600"
                }`}
                onClick={() => setAudienceType(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-bold text-slate-600">
                {t("campaigns.gender")}
              </span>
              <select
                className="input"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="">{t("campaigns.any")}</option>
                <option value="male">{t("queue.male")}</option>
                <option value="female">{t("queue.female")}</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-bold text-slate-600">
                {t("campaigns.age")}
              </span>
              <select
                className="input"
                value={age}
                onChange={(e) => setAge(e.target.value)}
              >
                <option value="">{t("campaigns.any")}</option>
                <option value="13_17">13–17</option>
                <option value="18_34">18–34</option>
                <option value="35_54">35–54</option>
                <option value="55_plus">55+</option>
              </select>
            </label>
          </div>

          <div className="rounded-xl bg-gradient-to-l from-brand-700 to-brand-500 px-4 py-3 text-white">
            <div className="text-xs opacity-80">{t("campaigns.liveCount")}</div>
            <div className="text-2xl font-extrabold">
              {estimate?.count ?? "…"}
            </div>
            <div className="text-sm opacity-90">
              {t("campaigns.estCost")}: {costLabel}
              {estimate && (
                <span className="ms-2 opacity-80" dir="ltr">
                  ({estimate.price_per_message} SAR/msg)
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            className="btn-primary w-full"
            disabled={!estimate || estimate.count < 1}
            onClick={() => setStep(2)}
          >
            {t("campaigns.next")}
          </button>
        </div>
      )}

      {step === 2 && (
        <form className="space-y-4" onSubmit={createAndSend}>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className="btn-ghost text-xs"
                onClick={() =>
                  setMessage(i18n.language === "en" ? tpl.en : tpl.ar)
                }
              >
                {t(`campaigns.tpl.${tpl.id}`)}
              </button>
            ))}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-bold text-slate-600">
              {t("campaigns.campaignName")}
            </span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("campaigns.defaultName")}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-bold text-slate-600">
              {t("campaigns.message")}
            </span>
            <textarea
              className="input min-h-[120px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              maxLength={1000}
            />
          </label>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
            <div className="mb-1 text-xs font-bold text-slate-500">
              {t("campaigns.preview")}
            </div>
            <pre className="whitespace-pre-wrap font-sans text-brand-800">
              {message}
            </pre>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setStep(1)}
            >
              {t("campaigns.back")}
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={busy}>
              {busy ? t("common.loading") : t("campaigns.sendNow")}
            </button>
          </div>
        </form>
      )}

      {(status || error) && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            error
              ? "bg-rose-50 text-rose-700"
              : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {error || status}
        </div>
      )}

      <div>
        <h4 className="mb-2 font-extrabold text-brand-800">
          {t("campaigns.history")}
        </h4>
        {campaigns.length === 0 ? (
          <p className="text-sm text-slate-400">{t("campaigns.empty")}</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {campaigns.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div>
                  <div className="font-bold text-brand-800">{c.name}</div>
                  <div className="text-xs text-slate-500">
                    {c.audience_type === "new_in_area"
                      ? t("campaigns.newInArea")
                      : t("campaigns.past")}{" "}
                    · {c.audience_count} · {c.cost} SAR
                  </div>
                  {c.rejection_reason && (
                    <div className="text-xs text-rose-600">
                      {c.rejection_reason}
                    </div>
                  )}
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">
                  {c.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
