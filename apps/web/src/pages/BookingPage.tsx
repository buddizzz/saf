import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch, assetUrl } from "../lib/api";
import { resolveShopTheme, themeVars } from "../themes";
import { Logo } from "../components/Logo";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

interface BookShop {
  id: string;
  name: string;
  slug: string;
  theme_id: string;
  theme_custom: string | null;
  logo_url: string | null;
  tagline: string | null;
}

interface DaySlots {
  date: string;
  slots: string[];
}

export function BookingPage() {
  const { slug = "" } = useParams();
  const { t, i18n } = useTranslation();
  const [shop, setShop] = useState<BookShop | null>(null);
  const [days, setDays] = useState<DaySlots[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [form, setForm] = useState({ customer_name: "", phone: "+9665" });
  const [done, setDone] = useState<{
    appointment_time: number;
    cancel_token: string;
    id: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const shopRes = await apiFetch<{ shop: BookShop }>(`/book/${slug}`);
        const avail = await apiFetch<{ days: DaySlots[] }>(
          `/book/${slug}/availability`,
        );
        if (cancelled) return;
        setShop(shopRes.shop);
        setDays(avail.days);
        const first = avail.days.find((d) => d.slots.length > 0);
        if (first) {
          setDate(first.date);
          setTime(first.slots[0] ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("booking.unavailable"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, t]);

  const slots = useMemo(
    () => days.find((d) => d.date === date)?.slots ?? [],
    [days, date],
  );

  const theme = shop
    ? resolveShopTheme(shop)
    : resolveShopTheme({ theme_id: "modern", theme_custom: null });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{
        appointment: {
          id: string;
          appointment_time: number;
          cancel_token: string;
        };
      }>("/appointments", {
        method: "POST",
        body: JSON.stringify({
          shop_slug: slug,
          customer_name: form.customer_name,
          phone: form.phone,
          date,
          time,
        }),
      });
      setDone(res.appointment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-brand-600">
        {t("common.loading")}
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-bold text-brand-800">{error ?? t("booking.unavailable")}</p>
        <Link to="/" className="btn-ghost">
          {t("common.back")}
        </Link>
      </div>
    );
  }

  const locale = i18n.language === "ar" ? "ar-SA" : "en-US";
  const logo = assetUrl(shop.logo_url);

  return (
    <div
      className="min-h-screen"
      style={{
        ...themeVars(theme),
        background: `linear-gradient(165deg, ${theme.bg} 0%, ${theme.surface} 45%, ${theme.bg} 100%)`,
      }}
    >
      <div className="mx-auto flex min-h-screen max-w-lg flex-col px-5 py-8">
        <div className="mb-8 flex items-center justify-between">
          <Logo size={32} />
          <div className="flex items-center gap-3">
            <Link
              to={`/q/${shop.slug}`}
              className="text-sm font-bold hover:underline"
              style={{ color: theme.primary }}
            >
              {t("booking.liveQueue")}
            </Link>
            <LanguageSwitcher />
          </div>
        </div>

        <div className="animate-fade-in text-center">
          {logo ? (
            <img
              src={logo}
              alt=""
              className="mx-auto mb-3 h-16 w-16 rounded-2xl object-cover shadow-soft"
            />
          ) : (
            <div
              className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-extrabold text-white shadow-soft"
              style={{ background: theme.primary }}
            >
              {shop.name.slice(0, 1)}
            </div>
          )}
          <h1
            className="text-3xl font-extrabold"
            style={{ color: theme.primaryDark }}
          >
            {shop.name}
          </h1>
          {shop.tagline && (
            <p className="mt-1 text-sm text-slate-500">{shop.tagline}</p>
          )}
          <p className="mt-3 text-sm font-bold" style={{ color: theme.primary }}>
            {t("booking.hero")}
          </p>
        </div>

        {done ? (
          <div className="card mt-8 animate-scale-in text-center">
            <div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-white"
              style={{ background: theme.accent }}
            >
              ✓
            </div>
            <h2 className="text-xl font-extrabold text-brand-800">
              {t("booking.confirmed")}
            </h2>
            <p className="mt-2 text-slate-600">
              {new Date(done.appointment_time * 1000).toLocaleString(locale)}
            </p>
            <button
              className="btn-ghost mt-4"
              onClick={async () => {
                await apiFetch(
                  `/appointments/${done.id}?token=${encodeURIComponent(done.cancel_token)}`,
                  { method: "DELETE" },
                );
                setDone(null);
                const avail = await apiFetch<{ days: DaySlots[] }>(
                  `/book/${slug}/availability`,
                );
                setDays(avail.days);
              }}
            >
              {t("booking.cancelAppt")}
            </button>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="card mt-8 animate-fade-in space-y-4"
            style={{ animationDelay: "80ms" }}
          >
            <div>
              <label className="label">{t("booking.pickDay")}</label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {days.map((d) => {
                  const label = new Date(d.date + "T12:00:00Z").toLocaleDateString(
                    locale,
                    { weekday: "short", day: "numeric", month: "short" },
                  );
                  const disabled = d.slots.length === 0;
                  return (
                    <button
                      key={d.date}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setDate(d.date);
                        setTime(d.slots[0] ?? "");
                      }}
                      className={`shrink-0 rounded-xl px-3 py-2 text-sm font-bold transition ${
                        date === d.date
                          ? "text-white shadow-soft"
                          : disabled
                            ? "bg-slate-50 text-slate-300"
                            : "bg-slate-100 text-brand-800 hover:bg-brand-50"
                      }`}
                      style={
                        date === d.date
                          ? { background: theme.primary }
                          : undefined
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="label">{t("booking.pickTime")}</label>
              <div className="grid grid-cols-4 gap-2" dir="ltr">
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTime(s)}
                    className={`rounded-lg py-2 text-sm font-bold ${
                      time === s
                        ? "text-white"
                        : "bg-slate-100 text-brand-800 hover:bg-brand-50"
                    }`}
                    style={time === s ? { background: theme.accent } : undefined}
                  >
                    {s}
                  </button>
                ))}
                {slots.length === 0 && (
                  <p className="col-span-4 text-sm text-slate-400">
                    {t("booking.noSlots")}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="label">{t("queue.yourName")}</label>
              <input
                className="field"
                value={form.customer_name}
                onChange={(e) =>
                  setForm({ ...form, customer_name: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="label">{t("queue.yourPhone")}</label>
              <input
                className="field"
                dir="ltr"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                pattern="\+9665\d{8}"
                required
              />
            </div>

            {error && (
              <p className="text-sm font-bold text-rose-600">{error}</p>
            )}

            <button
              className="btn w-full text-white"
              style={{ background: theme.primary }}
              disabled={busy || !date || !time}
            >
              {busy ? t("common.loading") : t("booking.confirm")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
