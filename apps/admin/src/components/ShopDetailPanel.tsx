import { FormEvent, useEffect, useState } from "react";
import { adminFetch } from "../lib/api";
import { formatMoney, formatTs } from "../lib/format";

interface ShopDetail {
  shop: {
    id: string;
    name: string;
    slug: string;
    shop_type: string;
    subscription_tier: string;
    subscription_status: string;
    subscription_renews_at: number | null;
    is_active: number;
    is_accepting_queue: number;
    suspended_at: number | null;
    suspend_reason: string | null;
    created_at: number;
    city_name: string | null;
    district_name: string | null;
    osm_display_name: string | null;
    lat: number | null;
    lng: number | null;
  };
  owner: { id: string; name: string; email: string; created_at: number } | null;
  staff: Array<{
    id: string;
    name: string;
    role: string;
    is_active: number;
    created_at: number;
  }>;
  subscriptions: Array<{
    id: string;
    plan: string;
    status: string;
    provider: string | null;
    current_period_end: number | null;
    created_at: number;
  }>;
  balance: { balance: number; updated_at?: number };
  stats: {
    visit_count: number;
    queue_today: {
      total: number;
      waiting: number;
      serving: number;
      done: number;
    };
    upcoming_appointments: number;
    open_reports: number;
  };
  recent_campaigns: Array<{
    id: string;
    name: string;
    status: string;
    audience_count: number;
    cost: number;
    created_at: number;
  }>;
  recent_payments: Array<{
    id: string;
    amount: number;
    bonus_amount: number;
    provider: string | null;
    status: string;
    note: string | null;
    created_at: number;
  }>;
}

export function ShopDetailPanel({
  shopId,
  canWrite,
  isSuper,
  onClose,
  onChanged,
}: {
  shopId: string;
  canWrite: boolean;
  isSuper: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<ShopDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState("100");
  const [creditReason, setCreditReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);
    void (async () => {
      try {
        const res = await adminFetch<ShopDetail>(`/admin/shops/${shopId}`);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "تعذّر التحميل");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const reload = async () => {
    setError(null);
    try {
      const res = await adminFetch<ShopDetail>(`/admin/shops/${shopId}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر التحميل");
    }
  };

  const adjustBalance = async (e: FormEvent) => {
    e.preventDefault();
    if (!creditReason.trim()) return;
    setBusy(true);
    try {
      await adminFetch(`/admin/shops/${shopId}/balance-adjust`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(creditAmount),
          reason: creditReason,
          apply_bonus: true,
        }),
      });
      setCreditReason("");
      await reload();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="panel space-y-3">
        <div className="flex justify-between">
          <p className="text-sm text-rose-600">{error}</p>
          <button className="btn-ghost !px-2 !py-1 text-xs" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="panel text-sm text-ink-700/60">جارٍ تحميل تفاصيل المحل…</div>;
  }

  const { shop, owner, staff, subscriptions, balance, stats } = data;
  const q = stats.queue_today;

  return (
    <div className="panel space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">{shop.name}</h3>
          <p className="font-mono text-xs text-ink-700/60" dir="ltr">
            /{shop.slug} · {shop.id}
          </p>
          <p className="mt-1 text-sm text-ink-700/70">
            {[shop.city_name, shop.district_name].filter(Boolean).join(" · ") ||
              shop.osm_display_name ||
              "بدون موقع"}
          </p>
        </div>
        <button className="btn-ghost" onClick={onClose}>
          إغلاق
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["الرصيد", formatMoney(balance.balance)],
          ["زيارات عملاء", stats.visit_count],
          ["طابور اليوم", `${q.waiting ?? 0} انتظار / ${q.total ?? 0}`],
          ["مواعيد قادمة", stats.upcoming_appointments],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg bg-ink-50 px-3 py-2">
            <div className="text-[11px] font-semibold text-ink-700/60">{label}</div>
            <div className="mt-0.5 font-semibold text-ink-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <h4 className="text-sm font-bold">المالك</h4>
          {owner ? (
            <div className="text-sm">
              <div className="font-semibold">{owner.name}</div>
              <div className="text-ink-700/70" dir="ltr">
                {owner.email}
              </div>
              <div className="text-xs text-ink-700/50">
                منذ {formatTs(owner.created_at)}
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-700/60">—</p>
          )}
          <div className="pt-2 text-sm">
            <div>
              الباقة:{" "}
              <span className="font-semibold">
                {shop.subscription_tier} · {shop.subscription_status}
              </span>
            </div>
            <div>التجديد: {formatTs(shop.subscription_renews_at)}</div>
            <div>
              الحالة:{" "}
              {shop.suspended_at
                ? `موقوف — ${shop.suspend_reason ?? ""}`
                : shop.is_active
                  ? "نشط"
                  : "غير نشط"}
            </div>
            <div>يقبل طابور: {shop.is_accepting_queue ? "نعم" : "لا"}</div>
            <div>بلاغات مفتوحة: {stats.open_reports}</div>
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-bold">الموظفون ({staff.length})</h4>
          {staff.length === 0 ? (
            <p className="text-sm text-ink-700/60">لا يوجد موظفون</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {staff.map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span>
                    {s.name}{" "}
                    <span className="text-xs text-ink-700/50">({s.role})</span>
                  </span>
                  <span className={s.is_active ? "text-emerald-700" : "text-ink-700/50"}>
                    {s.is_active ? "نشط" : "موقوف"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {subscriptions.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-sm font-bold">سجل الاشتراكات</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-ink-700/60">
                <tr>
                  <th className="py-1 text-right font-semibold">الخطة</th>
                  <th className="py-1 text-right font-semibold">الحالة</th>
                  <th className="py-1 text-right font-semibold">مزوّد</th>
                  <th className="py-1 text-right font-semibold">ينتهي</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((s) => (
                  <tr key={s.id} className="border-t border-ink-50">
                    <td className="py-1.5">{s.plan}</td>
                    <td className="py-1.5">{s.status}</td>
                    <td className="py-1.5">{s.provider ?? "—"}</td>
                    <td className="py-1.5">{formatTs(s.current_period_end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <h4 className="text-sm font-bold">حملات أخيرة</h4>
          {data.recent_campaigns.length === 0 ? (
            <p className="text-sm text-ink-700/60">لا توجد</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.recent_campaigns.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {c.name}{" "}
                    <span className="text-xs text-ink-700/50">({c.status})</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs">
                    {formatMoney(c.cost)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-2">
          <h4 className="text-sm font-bold">مدفوعات أخيرة</h4>
          {data.recent_payments.length === 0 ? (
            <p className="text-sm text-ink-700/60">لا توجد</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.recent_payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span className="truncate text-ink-700/70">
                    {p.note ?? p.provider ?? p.status}
                  </span>
                  <span className="shrink-0 font-mono text-xs">
                    {formatMoney(p.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {isSuper && canWrite && (
        <form onSubmit={adjustBalance} className="space-y-3 border-t border-ink-100 pt-4">
          <h4 className="text-sm font-bold">تعديل الرصيد</h4>
          <div className="flex flex-wrap gap-2">
            <input
              className="field max-w-[140px]"
              type="number"
              step="0.01"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              required
            />
            <input
              className="field min-w-[200px] flex-1"
              placeholder="السبب"
              value={creditReason}
              onChange={(e) => setCreditReason(e.target.value)}
              required
            />
            <button className="btn-primary" disabled={busy}>
              حفظ
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
