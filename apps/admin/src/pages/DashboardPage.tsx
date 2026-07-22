import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminFetch } from "../lib/api";
import { useAdminAuth } from "../lib/auth";

interface Overview {
  shops_total: number;
  shops_active: number;
  shops_suspended: number;
  shops_pro: number;
  shops_free: number;
  open_reports: number;
  upcoming: number;
}

interface ShopRow {
  id: string;
  name: string;
  slug: string;
  subscription_tier: string;
  subscription_status: string;
  is_active: number;
  suspended_at: number | null;
  suspend_reason: string | null;
  created_at: number;
  city_id?: string | null;
  district_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  osm_display_name?: string | null;
  location_source?: string | null;
}

interface AuditEntry {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  admin_email: string | null;
  created_at: number;
}

type Tab = "overview" | "shops" | "audit";

export function DashboardPage() {
  const { admin, logout } = useAdminAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [query, setQuery] = useState("");
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [selected, setSelected] = useState<ShopRow | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const canWrite = admin?.role === "super_admin" || admin?.role === "ops_admin";
  const isSuper = admin?.role === "super_admin";

  const loadOverview = useCallback(async () => {
    if (admin?.role === "support_agent") return;
    const res = await adminFetch<{ overview: Overview }>(
      "/admin/analytics/overview",
    );
    setOverview(res.overview);
  }, [admin?.role]);

  const loadShops = useCallback(async () => {
    const res = await adminFetch<{ shops: ShopRow[] }>(
      `/admin/shops?q=${encodeURIComponent(query)}&limit=50`,
    );
    setShops(res.shops);
  }, [query]);

  const loadAudit = useCallback(async () => {
    if (!canWrite) return;
    const res = await adminFetch<{ entries: AuditEntry[] }>("/admin/audit-log");
    setAudit(res.entries);
  }, [canWrite]);

  useEffect(() => {
    void loadOverview();
    void loadShops();
    void loadAudit();
  }, [loadOverview, loadShops, loadAudit]);

  const suspend = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !reason.trim()) return;
    await adminFetch(`/admin/shops/${selected.id}/suspend`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    setMessage("تم إيقاف المحل");
    setReason("");
    setSelected(null);
    await loadShops();
    await loadOverview();
    await loadAudit();
  };

  const reactivate = async (shop: ShopRow) => {
    await adminFetch(`/admin/shops/${shop.id}/reactivate`, { method: "POST" });
    setMessage("تمت إعادة التفعيل");
    await loadShops();
    await loadOverview();
    await loadAudit();
  };

  const setTier = async (shop: ShopRow, tier: "free" | "pro") => {
    await adminFetch(`/admin/shops/${shop.id}/set-tier`, {
      method: "POST",
      body: JSON.stringify({
        tier,
        plan: "pro_monthly",
        reason: `admin set ${tier}`,
      }),
    });
    setMessage(tier === "pro" ? "تمت الترقية لـ Pro" : "تم الرجوع للمجانية");
    await loadShops();
    await loadOverview();
    await loadAudit();
  };

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-accent-500">Platform Admin</p>
          <h1 className="text-xl font-bold">لوحة تحكم صفّ</h1>
          <p className="text-sm text-ink-700/70">
            {admin?.name} · {admin?.role}
          </p>
        </div>
        <button className="btn-ghost" onClick={logout}>
          خروج
        </button>
      </header>

      <nav className="mb-5 flex gap-2">
        {(
          [
            ["overview", "نظرة عامة"],
            ["shops", "المحلات"],
            ...(canWrite ? [["audit", "سجل التدقيق"] as const] : []),
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "btn-primary" : "btn-ghost"}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {message && (
        <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          {message}
        </div>
      )}

      {tab === "overview" && overview && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["إجمالي المحلات", overview.shops_total],
            ["نشطة", overview.shops_active],
            ["موقوفة", overview.shops_suspended],
            ["Pro", overview.shops_pro],
            ["مجانية", overview.shops_free],
            ["بلاغات مفتوحة", overview.open_reports],
            ["مواعيد قادمة", overview.upcoming],
          ].map(([label, value]) => (
            <div key={String(label)} className="panel">
              <div className="text-xs font-semibold text-ink-700/60">{label}</div>
              <div className="mt-1 font-mono text-3xl font-bold text-ink-900">
                {value ?? 0}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "shops" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              className="field max-w-sm"
              placeholder="بحث بالاسم / slug / id"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="btn-ghost" onClick={() => void loadShops()}>
              بحث
            </button>
          </div>

          <div className="panel overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-ink-100 bg-ink-50 text-xs text-ink-700/70">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold">المحل</th>
                  <th className="px-4 py-3 text-right font-semibold">الباقة</th>
                  <th className="px-4 py-3 text-right font-semibold">الحالة</th>
                  <th className="px-4 py-3 text-right font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {shops.map((shop) => (
                  <tr key={shop.id} className="border-b border-ink-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{shop.name}</div>
                      <div className="font-mono text-xs text-ink-700/60" dir="ltr">
                        /{shop.slug}
                      </div>
                      {shop.osm_display_name && (
                        <div className="mt-1 max-w-[220px] truncate text-[11px] text-ink-700/50">
                          {shop.osm_display_name}
                        </div>
                      )}
                      {shop.lat != null && shop.lng != null && (
                        <div className="font-mono text-[10px] text-ink-700/40" dir="ltr">
                          {shop.lat.toFixed(4)}, {shop.lng.toFixed(4)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          shop.subscription_tier === "pro"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-ink-100 text-ink-700"
                        }`}
                      >
                        {shop.subscription_tier} · {shop.subscription_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {shop.suspended_at ? (
                        <span className="text-rose-600">موقوف</span>
                      ) : shop.is_active ? (
                        <span className="text-emerald-700">نشط</span>
                      ) : (
                        <span className="text-ink-700/60">غير نشط</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {canWrite && !shop.suspended_at && (
                          <button
                            className="btn-danger !px-2 !py-1 text-xs"
                            onClick={() => setSelected(shop)}
                          >
                            إيقاف
                          </button>
                        )}
                        {canWrite && shop.suspended_at && (
                          <button
                            className="btn-primary !px-2 !py-1 text-xs"
                            onClick={() => void reactivate(shop)}
                          >
                            تفعيل
                          </button>
                        )}
                        {isSuper && shop.subscription_tier !== "pro" && (
                          <button
                            className="btn-ghost !px-2 !py-1 text-xs"
                            onClick={() => void setTier(shop, "pro")}
                          >
                            → Pro
                          </button>
                        )}
                        {isSuper && shop.subscription_tier === "pro" && (
                          <button
                            className="btn-ghost !px-2 !py-1 text-xs"
                            onClick={() => void setTier(shop, "free")}
                          >
                            → Free
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <form onSubmit={suspend} className="panel max-w-lg space-y-3">
              <h3 className="font-bold">إيقاف «{selected.name}»</h3>
              <div>
                <label className="label">السبب (إلزامي)</label>
                <textarea
                  className="field min-h-[80px]"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                />
              </div>
              <div className="flex gap-2">
                <button className="btn-danger">تأكيد الإيقاف</button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setSelected(null)}
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {tab === "audit" && (
        <div className="panel overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-ink-100 bg-ink-50 text-xs text-ink-700/70">
              <tr>
                <th className="px-4 py-3 text-right">الإجراء</th>
                <th className="px-4 py-3 text-right">الهدف</th>
                <th className="px-4 py-3 text-right">الأدمن</th>
                <th className="px-4 py-3 text-right">السبب</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((entry) => (
                <tr key={entry.id} className="border-b border-ink-50">
                  <td className="px-4 py-3 font-mono text-xs">{entry.action}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {entry.target_type}:{entry.target_id.slice(0, 16)}
                  </td>
                  <td className="px-4 py-3">{entry.admin_email ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-700/70">
                    {entry.reason ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
