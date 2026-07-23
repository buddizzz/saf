import { FormEvent, useCallback, useEffect, useState } from "react";
import { CampaignsTab } from "../components/CampaignsTab";
import { FinanceTab } from "../components/FinanceTab";
import { PlatformTab } from "../components/PlatformTab";
import { ReportsTab } from "../components/ReportsTab";
import { ShopDetailPanel } from "../components/ShopDetailPanel";
import { adminFetch } from "../lib/api";
import { useAdminAuth } from "../lib/auth";
import { formatMoney, formatTs } from "../lib/format";
import { TwoFactorSetupCard } from "./LoginPage";
import { ShopsMap, type MapShop, type Presence } from "../components/ShopsMap";

interface Overview {
  shops_total: number;
  shops_active: number;
  shops_suspended: number;
  shops_pro: number;
  shops_free: number;
  open_reports: number;
  upcoming: number;
  campaigns_pending?: number;
  campaigns_completed?: number;
  campaigns_active?: number;
  messages_sent?: number;
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
  commercial_registration?: string | null;
  city_id?: string | null;
  district_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  osm_display_name?: string | null;
  location_source?: string | null;
  balance?: number;
  owner_name?: string | null;
  owner_email?: string | null;
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

interface MapCounts {
  total: number;
  online: number;
  offline: number;
  suspended: number;
  unlocated: number;
}

interface PlatformNotification {
  id: string;
  shop_id: string;
  shop_name: string;
  shop_slug: string;
  type: string;
  channel: string;
  message: string | null;
  status: string;
  error: string | null;
  created_at: number;
}

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  offline_week: "غياب أسبوع",
  trial_ending: "قرب انتهاء التجربة",
  renewal_due_7d: "تجديد خلال 7 أيام",
  renewal_due_1d: "تجديد خلال يوم",
  subscription_expired: "انتهى الاشتراك",
};

type Tab =
  | "overview"
  | "map"
  | "shops"
  | "reports"
  | "campaigns"
  | "finance"
  | "platform"
  | "alerts"
  | "audit";

export function DashboardPage() {
  const { admin, logout, mustEnroll2fa } = useAdminAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditQ, setAuditQ] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ShopRow | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [mapShops, setMapShops] = useState<MapShop[]>([]);
  const [mapCounts, setMapCounts] = useState<MapCounts | null>(null);
  const [mapFilter, setMapFilter] = useState<Presence | "all">("all");
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);
  const [cronBusy, setCronBusy] = useState(false);

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
    const params = new URLSearchParams({ limit: "50" });
    if (query.trim()) params.set("q", query.trim());
    if (tierFilter) params.set("tier", tierFilter);
    if (statusFilter) params.set("status", statusFilter);
    const res = await adminFetch<{ shops: ShopRow[] }>(
      `/admin/shops?${params}`,
    );
    setShops(res.shops);
  }, [query, tierFilter, statusFilter]);

  const loadAudit = useCallback(async () => {
    if (!canWrite) return;
    const params = new URLSearchParams({ limit: "100" });
    if (auditQ.trim()) params.set("q", auditQ.trim());
    if (auditAction.trim()) params.set("action", auditAction.trim());
    const res = await adminFetch<{ entries: AuditEntry[] }>(
      `/admin/audit-log?${params}`,
    );
    setAudit(res.entries);
  }, [canWrite, auditQ, auditAction]);

  const loadMap = useCallback(async () => {
    const res = await adminFetch<{ shops: MapShop[]; counts: MapCounts }>(
      "/admin/shops/map",
    );
    setMapShops(res.shops);
    setMapCounts(res.counts);
  }, []);

  const loadNotifications = useCallback(async () => {
    const res = await adminFetch<{ notifications: PlatformNotification[] }>(
      "/admin/notifications",
    );
    setNotifications(res.notifications);
  }, []);

  useEffect(() => {
    void loadOverview();
    void loadShops();
    void loadAudit();
    void loadMap();
    void loadNotifications();
  }, [loadOverview, loadShops, loadAudit, loadMap, loadNotifications]);

  const refreshAll = async () => {
    await Promise.all([
      loadOverview(),
      loadShops(),
      loadAudit(),
      loadMap(),
      loadNotifications(),
    ]);
  };

  const runCron = async () => {
    setCronBusy(true);
    try {
      await adminFetch("/admin/cron/run", { method: "POST" });
      setMessage("تم تشغيل دورات الأتمتة (دورة الحياة + الحملات)");
      await Promise.all([loadNotifications(), loadMap(), loadOverview()]);
    } finally {
      setCronBusy(false);
    }
  };

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
    await refreshAll();
  };

  const reactivate = async (shop: ShopRow) => {
    await adminFetch(`/admin/shops/${shop.id}/reactivate`, { method: "POST" });
    setMessage("تمت إعادة التفعيل");
    await refreshAll();
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
    await refreshAll();
  };

  const tabs: Array<[Tab, string]> = [
    ["overview", "نظرة عامة"],
    ["map", "الخريطة"],
    ["shops", "المحلات"],
    ["alerts", "التنبيهات"],
    ...(canWrite
      ? ([
          ["reports", "البلاغات"],
          ["campaigns", "الحملات"],
          ["finance", "المالية"],
          ["platform", "المنصة"],
          ["audit", "سجل التدقيق"],
        ] as Array<[Tab, string]>)
      : []),
  ];

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

      <nav className="mb-5 flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "btn-primary" : "btn-ghost"}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "reports" && overview && overview.open_reports > 0
              ? ` (${overview.open_reports})`
              : ""}
            {id === "campaigns" && overview && (overview.campaigns_pending ?? 0) > 0
              ? ` (${overview.campaigns_pending})`
              : ""}
          </button>
        ))}
      </nav>

      {message && (
        <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          {message}
        </div>
      )}

      {mustEnroll2fa && (
        <div className="mb-5">
          <TwoFactorSetupCard />
        </div>
      )}

      {tab === "overview" && overview && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["إجمالي المحلات", overview.shops_total, "shops"],
              ["نشطة", overview.shops_active, "shops"],
              ["موقوفة", overview.shops_suspended, "shops"],
              ["Pro", overview.shops_pro, "shops"],
              ["مجانية", overview.shops_free, "shops"],
              ["بلاغات مفتوحة", overview.open_reports, "reports"],
              ["مواعيد قادمة", overview.upcoming, null],
              [
                "حملات بانتظار المراجعة",
                overview.campaigns_pending ?? 0,
                "campaigns",
              ],
              ["حملات نشطة", overview.campaigns_active ?? 0, "campaigns"],
              ["حملات مكتملة", overview.campaigns_completed ?? 0, "campaigns"],
              ["رسائل مُرسلة", overview.messages_sent ?? 0, "campaigns"],
            ] as Array<[string, number, Tab | null]>
          ).map(([label, value, target]) => (
            <button
              key={label}
              type="button"
              className="panel text-right transition hover:ring-2 hover:ring-accent-500/30"
              onClick={() => {
                if (target) setTab(target);
              }}
              disabled={!target}
            >
              <div className="text-xs font-semibold text-ink-700/60">{label}</div>
              <div className="mt-1 font-mono text-3xl font-bold text-ink-900">
                {value ?? 0}
              </div>
            </button>
          ))}
        </div>
      )}

      {tab === "map" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-700/70">
              متصل = نشاط خلال آخر 7 أيام (طابور أو تحديث من المالك). غير المتصل
              لأسبوع يستلم تنبيه واتساب تلقائيًا.
            </p>
            {canWrite && (
              <button
                className="btn-ghost text-xs"
                onClick={() => void runCron()}
                disabled={cronBusy}
              >
                {cronBusy ? "جارٍ التشغيل…" : "تشغيل الأتمتة الآن"}
              </button>
            )}
          </div>

          {mapCounts && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["الإجمالي", mapCounts.total, "all"],
                  ["متصلة", mapCounts.online, "online"],
                  ["غير متصلة", mapCounts.offline, "offline"],
                  ["موقوفة / معطّلة", mapCounts.suspended, "suspended"],
                ] as Array<[string, number, Presence | "all"]>
              ).map(([label, value, key]) => (
                <button
                  key={key}
                  className={`panel text-right transition ${
                    mapFilter === key ? "ring-2 ring-accent-500" : ""
                  }`}
                  onClick={() => setMapFilter(key)}
                >
                  <div className="text-xs font-semibold text-ink-700/60">
                    {label}
                  </div>
                  <div
                    className={`mt-1 font-mono text-3xl font-bold ${
                      key === "online"
                        ? "text-emerald-600"
                        : key === "offline"
                          ? "text-rose-600"
                          : "text-ink-900"
                    }`}
                  >
                    {value}
                  </div>
                </button>
              ))}
            </div>
          )}

          <ShopsMap shops={mapShops} filter={mapFilter} />

          <div className="flex flex-wrap gap-4 text-xs text-ink-700/70">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-emerald-500" /> متصل
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-rose-500" /> غير متصل (7+ أيام)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-slate-400" /> موقوف / معطّل
            </span>
            {mapCounts && mapCounts.unlocated > 0 && (
              <span>({mapCounts.unlocated} محل بدون إحداثيات لا يظهر على الخريطة)</span>
            )}
          </div>
        </div>
      )}

      {tab === "alerts" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-700/70">
              إشعارات المنصة المُرسلة لأصحاب المحلات عبر واتساب: غياب أسبوع، قرب
              انتهاء التجربة، تذكير التجديد، وانتهاء الاشتراك.
            </p>
            {canWrite && (
              <button
                className="btn-ghost text-xs"
                onClick={() => void runCron()}
                disabled={cronBusy}
              >
                {cronBusy ? "جارٍ التشغيل…" : "تشغيل الأتمتة الآن"}
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="panel text-sm text-ink-700/60">
              لا توجد تنبيهات بعد — ستظهر هنا تلقائيًا مع دورة الأتمتة (كل 15 دقيقة)
            </div>
          ) : (
            <div className="panel overflow-x-auto p-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-ink-100 bg-ink-50 text-xs text-ink-700/70">
                  <tr>
                    <th className="px-4 py-3 text-right font-semibold">المحل</th>
                    <th className="px-4 py-3 text-right font-semibold">النوع</th>
                    <th className="px-4 py-3 text-right font-semibold">الحالة</th>
                    <th className="px-4 py-3 text-right font-semibold">الرسالة</th>
                    <th className="px-4 py-3 text-right font-semibold">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((n) => (
                    <tr key={n.id} className="border-b border-ink-50 align-top">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{n.shop_name}</div>
                        <div className="font-mono text-xs text-ink-700/60" dir="ltr">
                          /{n.shop_slug}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            n.type === "offline_week"
                              ? "bg-rose-100 text-rose-800"
                              : n.type === "subscription_expired"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-ink-100 text-ink-700"
                          }`}
                        >
                          {NOTIFICATION_TYPE_LABELS[n.type] ?? n.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {n.status === "sent" ? (
                          <span className="text-emerald-700">أُرسل</span>
                        ) : n.status === "skipped" ? (
                          <span className="text-ink-700/60">تخطّي (بدون رقم)</span>
                        ) : (
                          <span className="text-rose-600" title={n.error ?? ""}>
                            فشل
                          </span>
                        )}
                      </td>
                      <td className="max-w-[320px] px-4 py-3 text-xs text-ink-700/70">
                        <div className="line-clamp-3 whitespace-pre-wrap">
                          {n.message ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-700/60" dir="ltr">
                        {new Date(n.created_at * 1000).toLocaleString("ar-SA")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "shops" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <input
              className="field max-w-sm"
              placeholder="بحث: اسم / slug / بريد المالك"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="field max-w-[140px]"
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
            >
              <option value="">كل الباقات</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
            </select>
            <select
              className="field max-w-[140px]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">كل الحالات</option>
              <option value="active">نشط</option>
              <option value="suspended">موقوف</option>
            </select>
            <button className="btn-ghost" onClick={() => void loadShops()}>
              بحث
            </button>
          </div>

          {detailId && (
            <ShopDetailPanel
              shopId={detailId}
              canWrite={canWrite}
              isSuper={isSuper}
              onClose={() => setDetailId(null)}
              onChanged={() => void refreshAll()}
            />
          )}

          <div className="panel overflow-x-auto p-0">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="border-b border-ink-100 bg-ink-50 text-xs text-ink-700/70">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold">المحل</th>
                  <th className="px-4 py-3 text-right font-semibold">المالك</th>
                  <th className="px-4 py-3 text-right font-semibold">الباقة</th>
                  <th className="px-4 py-3 text-right font-semibold">الرصيد</th>
                  <th className="px-4 py-3 text-right font-semibold">الحالة</th>
                  <th className="px-4 py-3 text-right font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {shops.map((shop) => (
                  <tr key={shop.id} className="border-b border-ink-50">
                    <td className="px-4 py-3">
                      <button
                        className="text-right font-semibold text-accent-600 hover:underline"
                        onClick={() => setDetailId(shop.id)}
                      >
                        {shop.name}
                      </button>
                      <div className="font-mono text-xs text-ink-700/60" dir="ltr">
                        /{shop.slug}
                      </div>
                      {shop.commercial_registration && (
                        <div className="mt-1 font-mono text-[11px] text-ink-700/55" dir="ltr">
                          CR {shop.commercial_registration}
                        </div>
                      )}
                      {shop.osm_display_name && (
                        <div className="mt-1 max-w-[220px] truncate text-[11px] text-ink-700/50">
                          {shop.osm_display_name}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">{shop.owner_name ?? "—"}</div>
                      <div className="text-xs text-ink-700/60" dir="ltr">
                        {shop.owner_email ?? ""}
                      </div>
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
                    <td className="px-4 py-3 font-mono text-xs">
                      {formatMoney(shop.balance ?? 0)}
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
                        <button
                          className="btn-ghost !px-2 !py-1 text-xs"
                          onClick={() => setDetailId(shop.id)}
                        >
                          تفاصيل
                        </button>
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

      {tab === "reports" && canWrite && (
        <ReportsTab onChanged={() => void refreshAll()} />
      )}

      {tab === "campaigns" && canWrite && (
        <CampaignsTab onChanged={() => void refreshAll()} />
      )}

      {tab === "finance" && canWrite && <FinanceTab />}

      {tab === "platform" && canWrite && <PlatformTab isSuper={isSuper} />}

      {tab === "audit" && canWrite && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <input
              className="field max-w-xs"
              placeholder="بحث: هدف / سبب / أدمن"
              value={auditQ}
              onChange={(e) => setAuditQ(e.target.value)}
            />
            <input
              className="field max-w-[180px]"
              placeholder="بادئة الإجراء (shop.)"
              value={auditAction}
              onChange={(e) => setAuditAction(e.target.value)}
              dir="ltr"
            />
            <button className="btn-ghost" onClick={() => void loadAudit()}>
              تصفية
            </button>
          </div>
          <div className="panel overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-ink-100 bg-ink-50 text-xs text-ink-700/70">
                <tr>
                  <th className="px-4 py-3 text-right">الإجراء</th>
                  <th className="px-4 py-3 text-right">الهدف</th>
                  <th className="px-4 py-3 text-right">الأدمن</th>
                  <th className="px-4 py-3 text-right">السبب</th>
                  <th className="px-4 py-3 text-right">الوقت</th>
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
                    <td className="px-4 py-3 text-xs">
                      {formatTs(entry.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
