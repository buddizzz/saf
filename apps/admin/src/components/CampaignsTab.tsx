import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminFetch } from "../lib/api";
import { formatMoney, formatTs } from "../lib/format";

interface CampaignRow {
  id: string;
  name: string;
  shop_id: string;
  shop_name: string;
  shop_slug: string;
  audience_type: string;
  audience_count: number;
  cost: number;
  message: string;
  status: string;
  created_at: number;
  sent_at: number | null;
  rejection_reason: string | null;
  messages_sent?: number;
  messages_failed?: number;
  messages_total?: number;
}

export function CampaignsTab({ onChanged }: { onChanged: () => void }) {
  const [view, setView] = useState<"pending" | "all">("pending");
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<CampaignRow[]>([]);
  const [all, setAll] = useState<CampaignRow[]>([]);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    campaign: CampaignRow;
    message_breakdown: Array<{ status: string; count: number }>;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    const res = await adminFetch<{ campaigns: CampaignRow[] }>(
      "/admin/campaigns/pending",
    );
    setPending(res.campaigns);
  }, []);

  const loadAll = useCallback(async () => {
    const params = new URLSearchParams({ limit: "50" });
    if (statusFilter) params.set("status", statusFilter);
    if (query.trim()) params.set("q", query.trim());
    const res = await adminFetch<{ campaigns: CampaignRow[] }>(
      `/admin/campaigns?${params}`,
    );
    setAll(res.campaigns);
  }, [statusFilter, query]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  useEffect(() => {
    if (view === "all") void loadAll();
  }, [view, loadAll]);

  const approve = async (id: string) => {
    await adminFetch(`/admin/campaigns/${id}/approve`, { method: "POST" });
    setMessage("تمت الموافقة على الحملة");
    await loadPending();
    if (view === "all") await loadAll();
    onChanged();
  };

  const reject = async (e: FormEvent) => {
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
    if (view === "all") await loadAll();
    onChanged();
  };

  const openDetail = async (id: string) => {
    setDetailId(id);
    const res = await adminFetch<{
      campaign: CampaignRow;
      message_breakdown: Array<{ status: string; count: number }>;
    }>(`/admin/campaigns/${id}`);
    setDetail(res);
  };

  const list = view === "pending" ? pending : all;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          className={view === "pending" ? "btn-primary" : "btn-ghost"}
          onClick={() => setView("pending")}
        >
          بانتظار المراجعة ({pending.length})
        </button>
        <button
          className={view === "all" ? "btn-primary" : "btn-ghost"}
          onClick={() => setView("all")}
        >
          كل الحملات
        </button>
      </div>

      {view === "all" && (
        <div className="flex flex-wrap gap-2">
          <input
            className="field max-w-xs"
            placeholder="بحث بالاسم / المحل"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="field max-w-[180px]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">كل الحالات</option>
            <option value="pending_review">مراجعة</option>
            <option value="scheduled">مجدولة</option>
            <option value="sending">جارٍ الإرسال</option>
            <option value="completed">مكتملة</option>
            <option value="rejected">مرفوضة</option>
            <option value="failed">فاشلة</option>
            <option value="cancelled">ملغاة</option>
          </select>
          <button className="btn-ghost" onClick={() => void loadAll()}>
            تحديث
          </button>
        </div>
      )}

      {message && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {list.length === 0 ? (
        <div className="panel text-sm text-ink-700/60">لا توجد حملات</div>
      ) : (
        list.map((c) => (
          <div key={c.id} className="panel space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-bold">{c.name}</div>
                <div className="text-xs text-ink-700/60">
                  {c.shop_name} · /{c.shop_slug} · {c.status} ·{" "}
                  {c.audience_type} · {c.audience_count} · {formatMoney(c.cost)}
                </div>
                <div className="text-[11px] text-ink-700/50">
                  {formatTs(c.created_at)}
                  {typeof c.messages_sent === "number" &&
                    ` · أُرسل ${c.messages_sent}/${c.messages_total ?? 0}`}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  className="btn-ghost !px-2 !py-1 text-xs"
                  onClick={() => void openDetail(c.id)}
                >
                  تفاصيل
                </button>
                {c.status === "pending_review" && (
                  <>
                    <button
                      className="btn-primary !px-2 !py-1 text-xs"
                      onClick={() => void approve(c.id)}
                    >
                      موافقة
                    </button>
                    <button
                      className="btn-danger !px-2 !py-1 text-xs"
                      onClick={() => setRejectId(c.id)}
                    >
                      رفض
                    </button>
                  </>
                )}
              </div>
            </div>
            {view === "pending" && (
              <pre className="whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-sm">
                {c.message}
              </pre>
            )}
            {c.rejection_reason && (
              <p className="text-sm text-rose-700">رفض: {c.rejection_reason}</p>
            )}
          </div>
        ))
      )}

      {rejectId && (
        <form onSubmit={reject} className="panel max-w-lg space-y-3">
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

      {detailId && detail && (
        <div className="panel space-y-3">
          <div className="flex justify-between gap-2">
            <h3 className="font-bold">تفاصيل الحملة</h3>
            <button
              className="btn-ghost !px-2 !py-1 text-xs"
              onClick={() => {
                setDetailId(null);
                setDetail(null);
              }}
            >
              إغلاق
            </button>
          </div>
          <pre className="whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-sm">
            {detail.campaign.message}
          </pre>
          <div className="flex flex-wrap gap-3 text-sm">
            {detail.message_breakdown.length === 0 ? (
              <span className="text-ink-700/60">لا رسائل بعد</span>
            ) : (
              detail.message_breakdown.map((b) => (
                <span key={b.status} className="rounded-lg bg-ink-50 px-2 py-1">
                  {b.status}: <strong>{b.count}</strong>
                </span>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
