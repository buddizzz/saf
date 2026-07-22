import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../lib/api";
import type { Shop } from "../lib/types";

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

interface AvailRow {
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
}

interface AppointmentRow {
  id: string;
  customer_name: string;
  phone: string;
  appointment_time: number;
  duration_minutes: number;
  status: string;
}

export function BookingSettingsSection({
  shop,
}: {
  shop: Shop;
  onChange?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isPro = shop.subscription_tier === "pro";
  const [rows, setRows] = useState<
    Record<number, { enabled: boolean; start: string; end: string; duration: number }>
  >({});
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isPro) return;
    try {
      const avail = await apiFetch<{ availability: AvailRow[] }>(
        `/shops/${shop.id}/availability`,
        { auth: true },
      );
      const map: typeof rows = {};
      for (const d of DAYS) {
        const found = avail.availability.find((a) => a.day_of_week === d);
        map[d] = found
          ? {
              enabled: true,
              start: found.start_time,
              end: found.end_time,
              duration: found.slot_duration_minutes,
            }
          : { enabled: false, start: "09:00", end: "17:00", duration: 30 };
      }
      setRows(map);

      const appts = await apiFetch<{ appointments: AppointmentRow[] }>(
        `/shops/${shop.id}/appointments`,
        { auth: true },
      );
      setAppointments(appts.appointments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    }
  }, [isPro, shop.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setError(null);
    const availability = DAYS.filter((d) => rows[d]?.enabled).map((d) => ({
      day_of_week: d,
      start_time: rows[d].start,
      end_time: rows[d].end,
      slot_duration_minutes: rows[d].duration,
    }));
    try {
      await apiFetch(`/shops/${shop.id}/availability`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ availability }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    }
  };

  const cancelAppt = async (id: string) => {
    await apiFetch(`/appointments/${id}`, { method: "DELETE", auth: true });
    await load();
  };

  if (!isPro) {
    return (
      <div className="card">
        <h3 className="mb-2 font-extrabold text-brand-800">
          {t("booking.settingsTitle")}
        </h3>
        <p className="text-sm text-slate-500">{t("booking.proOnly")}</p>
      </div>
    );
  }

  const locale = i18n.language === "ar" ? "ar-SA" : "en-US";
  const bookUrl = `${location.origin}/book/${shop.slug}`;

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-extrabold text-brand-800">
            {t("booking.settingsTitle")}
          </h3>
          <Link
            to={`/book/${shop.slug}`}
            className="text-sm font-bold text-brand-600 hover:underline"
            target="_blank"
          >
            {t("booking.openPage")}
          </Link>
        </div>
        <p className="break-all font-mono text-xs text-slate-500" dir="ltr">
          {bookUrl}
        </p>

        <div className="space-y-2">
          {DAYS.map((d) => {
            const row = rows[d] ?? {
              enabled: false,
              start: "09:00",
              end: "17:00",
              duration: 30,
            };
            return (
              <div key={d} className="flex flex-wrap items-center gap-3">
                <label className="flex w-28 items-center gap-2 text-sm font-bold text-brand-800">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) =>
                      setRows((prev) => ({
                        ...prev,
                        [d]: { ...row, enabled: e.target.checked },
                      }))
                    }
                  />
                  {t(`settings.days.${DAY_KEYS[d]}`)}
                </label>
                {row.enabled && (
                  <div className="flex flex-wrap items-center gap-2" dir="ltr">
                    <input
                      type="time"
                      className="field !w-auto !py-1.5"
                      value={row.start}
                      onChange={(e) =>
                        setRows((prev) => ({
                          ...prev,
                          [d]: { ...row, start: e.target.value },
                        }))
                      }
                    />
                    <span className="text-slate-400">–</span>
                    <input
                      type="time"
                      className="field !w-auto !py-1.5"
                      value={row.end}
                      onChange={(e) =>
                        setRows((prev) => ({
                          ...prev,
                          [d]: { ...row, end: e.target.value },
                        }))
                      }
                    />
                    <select
                      className="field !w-auto !py-1.5"
                      value={row.duration}
                      onChange={(e) =>
                        setRows((prev) => ({
                          ...prev,
                          [d]: { ...row, duration: Number(e.target.value) },
                        }))
                      }
                    >
                      {[15, 30, 45, 60].map((m) => (
                        <option key={m} value={m}>
                          {m}m
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button className="btn-primary" onClick={() => void save()}>
          {saved ? t("settings.saved") : t("common.save")}
        </button>
        {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
      </div>

      <div className="card">
        <h3 className="mb-3 font-extrabold text-brand-800">
          {t("booking.upcoming")}
        </h3>
        {appointments.length === 0 ? (
          <p className="text-sm text-slate-400">{t("booking.noAppointments")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {appointments.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div>
                  <div className="font-bold text-brand-800">
                    {a.customer_name}
                  </div>
                  <div className="text-xs text-slate-500" dir="ltr">
                    {new Date(a.appointment_time * 1000).toLocaleString(locale)}{" "}
                    · {a.phone}
                  </div>
                </div>
                <button
                  className="text-sm font-bold text-rose-500 hover:underline"
                  onClick={() => void cancelAppt(a.id)}
                >
                  {t("booking.cancelAppt")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
