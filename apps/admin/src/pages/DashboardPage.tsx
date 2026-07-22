import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminFetch } from "../lib/api";
import { useAdminAuth } from "../lib/auth";
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

interface PendingCampaign {
  id: string;
  name: string;
  shop_id: string;
  shop_name: string;
  shop_slug: string;
  audience_type: string;
  audience_count: number;
  cost: number;
  message: string;
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

type Tab = "overview" | "map" | "shops" | "campaigns" | "alerts" | "audit";

export function DashboardPage() {
  const { admin, logout, mustEnroll2fa } = useAdminAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [query, setQuery] = useState("");
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [pending, setPending] = useState<PendingCampaign[]>([]);
  const [selected, setSelected] = useState<ShopRow | null>(null);
  const [reason, setReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [creditShop, setCreditShop] = useState<ShopRow | null>(null);
  const [creditAmount, setCreditAmount] = useState("100");
  const [creditReason, setCreditReason] = useState("");
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

  const loadPending = useCallback(async () => {
    if (!canWrite) return;
    const res = await adminFetch<{ campaigns: PendingCampaign[] }>(
      "/admin/campaigns/pending",
    );
    setPending(res.campaigns);
  }, [canWrite]);

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
    void loadPending();
    void loadMap();
    void loadNotifications();
  }, [loadOverview, loadShops, loadAudit, loadPending, loadMap, loadNotifications]);

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

  const approveCampaign = async (id: string) => {
    await adminFetch(`/admin/campaigns/${id}/approve`, { method: "POST" });
    setMessage("تمت الموافقة على الحملة وإرسالها");
    await loadPending();
    await loadOverview();
    await loadAudit();
  };

  const rejectCampaign = async (e: FormEvent) => {
    e.preventDefault();
    if (!rejectId || !rejectReason.trim()) return;
    await adminFetch(`/admin/campaigns/${rejectId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason: rejectReason }),
    });
    setMessage("تم رفض الحملة واسترجاع الرصيد");
    setRejectId(null);
    setRejectReason("");
    await loadPending();
    await loadOverview();
    await loadAudit();
  };

  const adjustBalance = async (e: FormEvent) => {
    e.preventDefault();
    if (!creditShop || !creditReason.trim()) return;
    await adminFetch(`/admin/shops/${creditShop.id}/balance-adjust`, {
      method: "POST",
      body: JSON.stringify({
        amount: Number(creditAmount),
        reason: creditReason,
        apply_bonus: true,
      }),
    });
    setMessage(`تم تعديل رصيد «${creditShop.name}»`);
    setCreditShop(null);
    setCreditReason("");
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

      <nav className="mb-5 flex flex-wrap gap-2">
        {(
          [
            ["overview", "نظرة عامة"],
            ["map", "الخريطة"],
            ["shops", "المحلات"],
            ...(canWrite ? [["campaigns", "مراجعة الحملات"] as const] : []),
            ["alerts", "التنبيهات"],
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

      {mustEnroll2fa && (
        <div className="mb-5">
          <TwoFactorSetupCard />
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
            ["حملات بانتظار المراجعة", overview.campaigns_pending ?? 0],
            ["حملات مكتملة", overview.campaigns_completed ?? 0],
            ["رسائل مُرسلة", overview.messages_sent ?? 0],
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
                        {isSuper && (
                          <button
                            className="btn-ghost !px-2 !py-1 text-xs"
                            onClick={() => setCreditShop(shop)}
                          >
                            رصيد
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

          {creditShop && (
            <form onSubmit={adjustBalance} className="panel max-w-lg space-y-3">
              <h3 className="font-bold">تعديل رصيد «{creditShop.name}»</h3>
              <p className="text-xs text-ink-700/60">
                بوابة الدفع مؤجّلة — الشحن اليدوي من هنا لتشغيل الحملات.
              </p>
              <div>
                <label className="label">المبلغ (موجب للشحن / سالب للخصم)</label>
                <input
                  className="field"
                  type="number"
                  step="0.01"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">السبب (إلزامي)</label>
                <input
                  className="field"
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  required
                />
              </div>
              <div className="flex gap-2">
                <button className="btn-primary">حفظ</button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setCreditShop(null)}
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {tab === "campaigns" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-700/70">
            حملات «عملاء جدد» الكبيرة أو التي تحتوي كلمات محظورة تنتظر موافقة يدوية.
          </p>
          {pending.length === 0 ? (
            <div className="panel text-sm text-ink-700/60">لا توجد حملات بانتظار المراجعة</div>
          ) : (
            pending.map((c) => (
              <div key={c.id} className="panel space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-bold">{c.name}</div>
                    <div className="text-xs text-ink-700/60">
                      {c.shop_name} · /{c.shop_slug} · {c.audience_type} ·{" "}
                      {c.audience_count} مستهدف · {c.cost} SAR
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-primary !px-3 !py-1 text-xs"
                      onClick={() => void approveCampaign(c.id)}
                    >
                      موافقة وإرسال
                    </button>
                    <button
                      className="btn-danger !px-3 !py-1 text-xs"
                      onClick={() => setRejectId(c.id)}
                    >
                      رفض
                    </button>
                  </div>
                </div>
                <pre className="whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-sm">
                  {c.message}
                </pre>
              </div>
            ))
          )}

          {rejectId && (
            <form onSubmit={rejectCampaign} className="panel max-w-lg space-y-3">
              <h3 className="font-bold">رفض الحملة</h3>
              <textarea
                className="field min-h-[80px]"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="سبب الرفض (يصل للمالك)"
                required
              />
              <div className="flex gap-2">
                <button className="btn-danger">تأكيد الرفض</button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setRejectId(null)}
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
