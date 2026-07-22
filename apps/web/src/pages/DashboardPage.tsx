import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useQueueWebSocket } from "../hooks/useQueueWebSocket";
import { Logo } from "../components/Logo";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { SettingsPanel } from "../components/SettingsPanel";
import type { Shop } from "../lib/types";

export function DashboardPage() {
  const { t } = useTranslation();
  const { owner, logout } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadShops = async () => {
    const res = await apiFetch<{ shops: Shop[] }>("/shops", { auth: true });
    setShops(res.shops);
    setSelectedId((prev) => prev ?? res.shops[0]?.id ?? null);
    setLoading(false);
  };

  useEffect(() => {
    void loadShops();
  }, []);

  const selected = useMemo(
    () => shops.find((s) => s.id === selectedId) ?? null,
    [shops, selectedId],
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo />
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <span className="hidden text-sm font-bold text-brand-700 sm:inline">
              {owner?.name}
            </span>
            <button className="btn-ghost" onClick={logout}>
              {t("dashboard.logout")}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {loading ? (
          <p className="text-brand-600">{t("common.loading")}</p>
        ) : shops.length === 0 ? (
          <CreateShopForm onCreated={loadShops} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
            <aside className="space-y-2">
              {shops.map((shop) => (
                <button
                  key={shop.id}
                  onClick={() => setSelectedId(shop.id)}
                  className={`w-full rounded-xl px-4 py-3 text-right font-bold transition ${
                    shop.id === selectedId
                      ? "bg-brand-600 text-white"
                      : "bg-white text-brand-700 hover:bg-brand-50"
                  }`}
                >
                  {shop.name}
                </button>
              ))}
              <CreateShopInline onCreated={loadShops} />
            </aside>
            {selected && (
              <ShopManager
                key={selected.id}
                shop={selected}
                onChange={loadShops}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function ShopManager({ shop, onChange }: { shop: Shop; onChange: () => void }) {
  const { t } = useTranslation();
  const { snapshot } = useQueueWebSocket(shop.id);
  const [accepting, setAccepting] = useState(shop.is_accepting_queue === 1);
  const [showSettings, setShowSettings] = useState(false);
  const customerUrl = `${location.origin}/q/${shop.slug}`;
  const [copied, setCopied] = useState(false);

  const control = async (action: "next" | "skip" | "complete") => {
    await apiFetch(`/queue/${shop.id}/${action}`, {
      method: "POST",
      auth: true,
    });
  };

  const toggleAccepting = async () => {
    const next = !accepting;
    setAccepting(next);
    await apiFetch(`/shops/${shop.id}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ is_accepting_queue: next }),
    });
    onChange();
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(customerUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const waiting = snapshot?.entries.filter((e) => e.status === "waiting") ?? [];
  const etaMinutes = snapshot
    ? Math.round((waiting.length * snapshot.avgServiceSeconds) / 60)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-brand-800">{shop.name}</h1>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost"
            onClick={() => setShowSettings((v) => !v)}
          >
            {showSettings ? t("settings.close") : t("settings.open")}
          </button>
          <button
            className={accepting ? "btn-ghost" : "btn-gold"}
            onClick={toggleAccepting}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                accepting ? "bg-emerald-500" : "bg-rose-500"
              }`}
            />
            {accepting ? t("dashboard.pauseQueue") : t("dashboard.resumeQueue")}
          </button>
        </div>
      </div>

      {showSettings && <SettingsPanel shop={shop} onChange={onChange} />}

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="card text-center">
              <div className="text-sm font-bold text-slate-500">
                {t("dashboard.currentServing")}
              </div>
              <div className="mt-1 text-5xl font-extrabold text-brand-700">
                {snapshot?.currentServing ?? "—"}
              </div>
            </div>
            <div className="card text-center">
              <div className="text-sm font-bold text-slate-500">
                {t("dashboard.waiting")}
              </div>
              <div className="mt-1 text-5xl font-extrabold text-gold-500">
                {waiting.length}
              </div>
              <div className="text-xs text-slate-400">
                ~{etaMinutes} {t("queue.minutes")}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="btn-primary flex-1" onClick={() => control("next")}>
              {t("dashboard.callNext")}
            </button>
            <button className="btn-ghost" onClick={() => control("skip")}>
              {t("dashboard.skip")}
            </button>
            <button className="btn-gold" onClick={() => control("complete")}>
              {t("dashboard.complete")}
            </button>
          </div>

          <div className="card">
            <h3 className="mb-3 font-extrabold text-brand-800">
              {t("dashboard.queueList")}
            </h3>
            {!snapshot || snapshot.entries.length === 0 ? (
              <p className="py-6 text-center text-slate-400">
                {t("dashboard.empty")}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {snapshot.entries.map((e) => (
                  <li
                    key={e.queueNumber}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold ${badge(
                          e.status,
                        )}`}
                      >
                        {e.queueNumber}
                      </span>
                      <span className="font-bold text-brand-800">{e.name}</span>
                    </div>
                    <StatusPill status={e.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card space-y-3 text-center">
          <h3 className="font-extrabold text-brand-800">
            {t("dashboard.customerLink")}
          </h3>
          <div className="mx-auto w-fit rounded-2xl border border-slate-100 bg-white p-3">
            <QRCodeSVG value={customerUrl} size={168} fgColor="#1f6675" />
          </div>
          <p className="text-xs text-slate-500">{t("dashboard.scanToJoin")}</p>
          <div className="break-all rounded-lg bg-slate-50 px-3 py-2 text-xs font-mono text-brand-700">
            {customerUrl}
          </div>
          <button className="btn-ghost w-full" onClick={copyLink}>
            {copied ? t("dashboard.copied") : t("dashboard.copyLink")}
          </button>
        </div>
      </div>
    </div>
  );
}

function badge(status: string): string {
  if (status === "called") return "bg-gold-400 text-brand-900";
  if (status === "served") return "bg-emerald-100 text-emerald-700";
  if (status === "waiting") return "bg-brand-100 text-brand-700";
  return "bg-slate-100 text-slate-400";
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    waiting: "bg-brand-50 text-brand-600",
    called: "bg-gold-100 text-gold-700",
    served: "bg-emerald-50 text-emerald-600",
    cancelled: "bg-slate-100 text-slate-400",
    no_show: "bg-rose-50 text-rose-500",
  };
  const label: Record<string, string> = {
    waiting: "بالانتظار",
    called: "مستدعى",
    served: "تمت الخدمة",
    cancelled: "ملغى",
    no_show: "لم يحضر",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${map[status]}`}>
      {label[status] ?? status}
    </span>
  );
}

function CreateShopInline({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        className="w-full rounded-xl border border-dashed border-brand-200 px-4 py-3 text-sm font-bold text-brand-500 hover:bg-brand-50"
        onClick={() => setOpen(true)}
      >
        + {t("dashboard.createShop")}
      </button>
    );
  }
  return (
    <div className="card mt-2">
      <CreateShopForm
        compact
        onCreated={() => {
          setOpen(false);
          onCreated();
        }}
      />
    </div>
  );
}

interface Location {
  id: string;
  name_ar: string;
  name_en: string;
}

function CreateShopForm({
  onCreated,
  compact = false,
}: {
  onCreated: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: "",
    shop_type: "salon",
    country_code: "SA",
    city_id: "",
    district_id: "",
  });
  const [cities, setCities] = useState<Location[]>([]);
  const [districts, setDistricts] = useState<Location[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ cities: Location[] }>(
      `/locations/cities?country=${form.country_code}`,
    ).then((r) => setCities(r.cities));
  }, [form.country_code]);

  useEffect(() => {
    if (!form.city_id) {
      setDistricts([]);
      return;
    }
    apiFetch<{ districts: Location[] }>(
      `/locations/districts?city=${form.city_id}`,
    ).then((r) => setDistricts(r.districts));
  }, [form.city_id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/shops", {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          name: form.name,
          shop_type: form.shop_type,
          country_code: form.country_code,
          city_id: form.city_id || null,
          district_id: form.district_id || null,
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  };

  const shopTypes = ["barber", "restaurant", "clinic", "salon", "other"];

  return (
    <form
      onSubmit={submit}
      className={compact ? "space-y-3" : "card max-w-lg space-y-4"}
    >
      {!compact && (
        <h2 className="text-xl font-extrabold text-brand-800">
          {t("dashboard.createShop")}
        </h2>
      )}
      <div>
        <label className="label">{t("dashboard.shopName")}</label>
        <input
          className="field"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      </div>
      <div>
        <label className="label">{t("dashboard.shopType")}</label>
        <select
          className="field"
          value={form.shop_type}
          onChange={(e) => setForm({ ...form, shop_type: e.target.value })}
        >
          {shopTypes.map((type) => (
            <option key={type} value={type}>
              {t(`dashboard.shopTypes.${type}`)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">{t("dashboard.city")}</label>
        <select
          className="field"
          value={form.city_id}
          onChange={(e) =>
            setForm({ ...form, city_id: e.target.value, district_id: "" })
          }
        >
          <option value="">—</option>
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name_ar}
            </option>
          ))}
        </select>
      </div>
      {districts.length > 0 && (
        <div>
          <label className="label">{t("dashboard.district")}</label>
          <select
            className="field"
            value={form.district_id}
            onChange={(e) => setForm({ ...form, district_id: e.target.value })}
          >
            <option value="">—</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name_ar}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? t("common.loading") : t("dashboard.create")}
      </button>
    </form>
  );
}
