import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { apiFetch } from "../lib/api";
import { readDeviceCoords } from "../lib/geo";
import { useAuth } from "../lib/auth";
import { useQueueWebSocket } from "../hooks/useQueueWebSocket";
import { Logo } from "../components/Logo";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { SettingsPanel } from "../components/SettingsPanel";
import { ShopAvatar } from "../components/ShopAvatar";
import { InstallHint, useWakeLock } from "../hooks/useWakeLock";
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
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/90 backdrop-blur-sm">
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
          <div className="flex items-center gap-2 text-brand-600">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600" />
            {t("common.loading")}
          </div>
        ) : shops.length === 0 ? (
          <div className="mx-auto max-w-lg">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-soft">
                <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" strokeLinecap="round" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M17 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85" strokeLinecap="round" />
                </svg>
              </div>
              <h2 className="text-xl font-extrabold text-brand-800">
                {t("dashboard.noShops")}
              </h2>
            </div>
            <CreateShopForm onCreated={loadShops} />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
            <aside className="space-y-2">
              {shops.map((shop) => (
                <button
                  key={shop.id}
                  onClick={() => setSelectedId(shop.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right font-bold transition ${
                    shop.id === selectedId
                      ? "bg-brand-600 text-white shadow-soft"
                      : "bg-white text-brand-700 hover:bg-brand-50"
                  }`}
                >
                  <ShopAvatar shop={shop} size={32} />
                  <span className="truncate">{shop.name}</span>
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
      <InstallHint />
    </div>
  );
}

function ShopManager({ shop, onChange }: { shop: Shop; onChange: () => void }) {
  const { t } = useTranslation();
  const { snapshot } = useQueueWebSocket(shop.id);
  const [accepting, setAccepting] = useState(shop.is_accepting_queue === 1);
  const [showSettings, setShowSettings] = useState(false);
  const wake = useWakeLock(true);
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
        <div className="flex items-center gap-3">
          <ShopAvatar shop={shop} size={44} />
          <div>
            <h1 className="text-2xl font-extrabold text-brand-800">
              {shop.name}
              {shop.subscription_tier === "pro" && (
                <span className="ms-2 align-middle rounded-full bg-gradient-to-l from-gold-400 to-gold-500 px-2 py-0.5 text-xs font-extrabold text-brand-900">
                  Pro
                </span>
              )}
            </h1>
            {shop.tagline && (
              <p className="text-sm text-slate-500">{shop.tagline}</p>
            )}
          </div>
        </div>
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
      {wake && (
        <p className="text-xs font-medium text-emerald-700">{t("pwa.wakeOn")}</p>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="card overflow-hidden text-center">
              <div className="text-sm font-bold text-slate-500">
                {t("dashboard.currentServing")}
              </div>
              <div className="mt-1 bg-gradient-to-br from-brand-600 to-brand-800 bg-clip-text text-5xl font-extrabold text-transparent">
                {snapshot?.currentServing ?? "—"}
              </div>
            </div>
            <div className="card overflow-hidden text-center">
              <div className="text-sm font-bold text-slate-500">
                {t("dashboard.waiting")}
              </div>
              <div className="mt-1 bg-gradient-to-br from-gold-400 to-gold-600 bg-clip-text text-5xl font-extrabold text-transparent">
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
              <div className="py-8 text-center text-slate-400">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-50">
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M4 6h16M4 12h16M4 18h7" strokeLinecap="round" />
                  </svg>
                </div>
                {t("dashboard.empty")}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {snapshot.entries.map((e) => (
                  <li
                    key={e.queueNumber}
                    className="flex items-center justify-between rounded-lg px-1 py-3 transition hover:bg-slate-50"
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
  distance_km?: number | null;
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
    region_id: "",
    city_id: "",
    district_id: "",
  });
  const [regions, setRegions] = useState<Location[]>([]);
  const [cities, setCities] = useState<Location[]>([]);
  const [districts, setDistricts] = useState<Location[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoHint, setGeoHint] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  useEffect(() => {
    void readDeviceCoords(4000).then((c) => {
      if (c) setCoords(c);
    });
  }, []);

  useEffect(() => {
    apiFetch<{ regions: Location[] }>(
      `/locations/regions?country=${form.country_code}`,
    ).then((r) => setRegions(r.regions));
  }, [form.country_code]);

  useEffect(() => {
    if (!form.region_id) {
      setCities([]);
      return;
    }
    const geoQs =
      coords != null ? `&lat=${coords.lat}&lng=${coords.lng}` : "";
    apiFetch<{ cities: Location[] }>(
      `/locations/cities?country=${form.country_code}&region=${form.region_id}${geoQs}`,
    ).then((r) => setCities(r.cities));
  }, [form.country_code, form.region_id, coords]);

  useEffect(() => {
    if (!form.city_id) {
      setDistricts([]);
      return;
    }
    const geoQs =
      coords != null ? `&lat=${coords.lat}&lng=${coords.lng}` : "";
    apiFetch<{ districts: Location[] }>(
      `/locations/districts?city=${form.city_id}${geoQs}`,
    ).then((r) => setDistricts(r.districts));
  }, [form.city_id, coords]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setGeoHint(t("location.locating"));
    try {
      const live = coords ?? (await readDeviceCoords());
      setGeoHint(
        live ? t("location.gpsCaptured") : t("location.ksaWillGeocode"),
      );
      await apiFetch("/shops", {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          name: form.name,
          shop_type: form.shop_type,
          country_code: form.country_code,
          city_id: form.city_id || null,
          district_id: form.district_id || null,
          lat: live?.lat ?? null,
          lng: live?.lng ?? null,
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
        <label className="label">{t("dashboard.region")}</label>
        <select
          className="field"
          value={form.region_id}
          onChange={(e) =>
            setForm({
              ...form,
              region_id: e.target.value,
              city_id: "",
              district_id: "",
            })
          }
          required
        >
          <option value="">—</option>
          {regions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.name_ar}
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
          required
          disabled={!form.region_id}
        >
          <option value="">—</option>
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name_ar}
              {city.distance_km != null ? ` · ${city.distance_km} كم` : ""}
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
                {d.distance_km != null ? ` · ${d.distance_km} كم` : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
      {geoHint && <p className="text-xs text-slate-500">{geoHint}</p>}
      <p className="text-xs text-slate-400">{t("location.createHint")}</p>
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? t("common.loading") : t("dashboard.create")}
      </button>
    </form>
  );
}
