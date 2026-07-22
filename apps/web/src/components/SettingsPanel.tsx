import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../lib/api";
import { THEMES } from "../themes";
import { BrandIdentitySection } from "./BrandIdentitySection";
import { SubscriptionSection } from "./SubscriptionSection";
import { BookingSettingsSection } from "./BookingSettingsSection";
import type { Shop, StaffMember, WorkingHours } from "../lib/types";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DEFAULT_HOURS = { open: "09:00", close: "22:00" };

export function SettingsPanel({
  shop,
  onChange,
}: {
  shop: Shop;
  onChange: () => void;
}) {
  const isPro = shop.subscription_tier === "pro";

  return (
    <div className="space-y-6">
      <SubscriptionSection shop={shop} onChange={onChange} />
      <BrandIdentitySection shop={shop} onChange={onChange} />
      <ThemeSection shop={shop} isPro={isPro} onChange={onChange} />
      <WorkingHoursSection shop={shop} onChange={onChange} />
      <BookingSettingsSection shop={shop} />
      <StaffSection shop={shop} isPro={isPro} />
    </div>
  );
}

function ThemeSection({
  shop,
  isPro,
  onChange,
}: {
  shop: Shop;
  isPro: boolean;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(shop.theme_id);

  // مزامنة التحديد مع حالة الخادم عند تغيّر بيانات المحل.
  useEffect(() => {
    setCurrent(shop.theme_id);
  }, [shop.theme_id]);

  const pick = async (themeId: string, locked: boolean) => {
    if (locked) return;
    setCurrent(themeId);
    await apiFetch(`/shops/${shop.id}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ theme_id: themeId }),
    });
    onChange();
  };

  return (
    <div className="card">
      <h3 className="mb-3 font-extrabold text-brand-800">
        {t("settings.theme")}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {THEMES.map((theme, index) => {
          const locked = !isPro && index > 0;
          const selected = current === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => pick(theme.id, locked)}
              className={`relative overflow-hidden rounded-xl border-2 p-3 text-center transition ${
                selected ? "border-brand-500" : "border-slate-100"
              } ${locked ? "opacity-50" : "hover:border-brand-300"}`}
            >
              <div className="mb-2 flex justify-center gap-1">
                <span
                  className="h-6 w-6 rounded-full"
                  style={{ background: theme.primary }}
                />
                <span
                  className="h-6 w-6 rounded-full"
                  style={{ background: theme.accent }}
                />
              </div>
              <div className="text-xs font-bold text-brand-700">
                {theme.nameAr}
              </div>
              {locked && <div className="mt-1 text-[10px] text-gold-600">Pro</div>}
            </button>
          );
        })}
      </div>
      {!isPro && (
        <p className="mt-3 text-xs text-slate-400">{t("settings.themeProOnly")}</p>
      )}
    </div>
  );
}

function WorkingHoursSection({
  shop,
  onChange,
}: {
  shop: Shop;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const [hours, setHours] = useState<WorkingHours>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (shop.working_hours) {
      try {
        setHours(JSON.parse(shop.working_hours));
      } catch {
        setHours({});
      }
    }
  }, [shop.working_hours]);

  const toggleDay = (day: string, enabled: boolean) => {
    setHours((prev) => ({ ...prev, [day]: enabled ? { ...DEFAULT_HOURS } : null }));
  };

  const setTime = (day: string, field: "open" | "close", value: string) => {
    setHours((prev) => ({
      ...prev,
      [day]: { ...(prev[day] ?? DEFAULT_HOURS), [field]: value },
    }));
  };

  const save = async () => {
    await apiFetch(`/shops/${shop.id}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ working_hours: hours }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onChange();
  };

  return (
    <div className="card">
      <h3 className="mb-3 font-extrabold text-brand-800">
        {t("settings.workingHours")}
      </h3>
      <div className="space-y-2">
        {DAYS.map((day) => {
          const value = hours[day];
          const enabled = !!value;
          return (
            <div key={day} className="flex items-center gap-3">
              <label className="flex w-28 items-center gap-2 text-sm font-bold text-brand-800">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => toggleDay(day, e.target.checked)}
                />
                {t(`settings.days.${day}`)}
              </label>
              {enabled ? (
                <div className="flex items-center gap-2" dir="ltr">
                  <input
                    type="time"
                    className="field !w-auto !py-1.5"
                    value={value.open}
                    onChange={(e) => setTime(day, "open", e.target.value)}
                  />
                  <span className="text-slate-400">–</span>
                  <input
                    type="time"
                    className="field !w-auto !py-1.5"
                    value={value.close}
                    onChange={(e) => setTime(day, "close", e.target.value)}
                  />
                </div>
              ) : (
                <span className="text-sm text-slate-400">
                  {t("settings.closedDay")}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <button className="btn-primary mt-4" onClick={save}>
        {saved ? t("settings.saved") : t("common.save")}
      </button>
    </div>
  );
}

function StaffSection({ shop, isPro }: { shop: Shop; isPro: boolean }) {
  const { t } = useTranslation();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [form, setForm] = useState({ name: "", pin: "" });
  const [error, setError] = useState<string | null>(null);
  const staffUrl = `${location.origin}/staff/${shop.slug}`;
  const limit = isPro ? 10 : 1;

  const load = useCallback(async () => {
    const res = await apiFetch<{ staff: StaffMember[] }>(
      `/shops/${shop.id}/staff`,
      { auth: true },
    );
    setStaff(res.staff);
  }, [shop.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch(`/shops/${shop.id}/staff`, {
        method: "POST",
        auth: true,
        body: JSON.stringify(form),
      });
      setForm({ name: "", pin: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    }
  };

  const remove = async (id: string) => {
    await apiFetch(`/shops/${shop.id}/staff/${id}`, {
      method: "DELETE",
      auth: true,
    });
    await load();
  };

  return (
    <div className="card">
      <h3 className="mb-1 font-extrabold text-brand-800">{t("settings.staff")}</h3>
      <p className="mb-3 text-xs text-slate-400">
        {t("settings.staffLimit", { count: staff.length, limit })}
      </p>
      {staff.length > 0 && (
        <ul className="mb-4 divide-y divide-slate-100">
          {staff.map((member) => (
            <li key={member.id} className="flex items-center justify-between py-2">
              <span className="font-bold text-brand-800">{member.name}</span>
              <button
                className="text-sm font-bold text-rose-500 hover:underline"
                onClick={() => remove(member.id)}
              >
                {t("settings.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <label className="label">{t("settings.staffName")}</label>
          <input
            className="field"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div className="w-32">
          <label className="label">{t("settings.staffPin")}</label>
          <input
            className="field"
            dir="ltr"
            inputMode="numeric"
            value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value })}
            pattern="\d{4,6}"
            required
          />
        </div>
        <button className="btn-primary" disabled={staff.length >= limit}>
          {t("settings.addStaff")}
        </button>
      </form>
      {error && <p className="mt-2 text-sm font-bold text-rose-600">{error}</p>}
      <div className="mt-4 text-sm">
        <span className="font-bold text-brand-800">
          {t("settings.staffLoginLink")}:
        </span>{" "}
        <span className="break-all font-mono text-brand-600">{staffUrl}</span>
      </div>
    </div>
  );
}
