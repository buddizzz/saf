import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminFetch } from "../lib/api";
import { formatTs } from "../lib/format";

interface ReportRow {
  id: string;
  shop_id: string;
  shop_name: string;
  shop_slug: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: number;
}

export function ReportsTab({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState("open");
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolveStatus, setResolveStatus] = useState<"resolved" | "dismissed">(
    "resolved",
  );
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminFetch<{ reports: ReportRow[] }>(
      `/admin/reports?status=${encodeURIComponent(status)}`,
    );
    setReports(res.reports);
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (e: FormEvent) => {
    e.preventDefault();
    if (!resolveId || !reason.trim()) return;
    await adminFetch(`/admin/reports/${resolveId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ status: resolveStatus, reason }),
    });
    setMessage(resolveStatus === "resolved" ? "تم حل البلاغ" : "تم صرف النظر");
    setResolveId(null);
    setReason("");
    await load();
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["open", "مفتوحة"],
            ["resolved", "محلولة"],
            ["dismissed", "مُهمَلة"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={status === id ? "btn-primary" : "btn-ghost"}
            onClick={() => setStatus(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {message && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {reports.length === 0 ? (
        <div className="panel text-sm text-ink-700/60">لا توجد بلاغات</div>
      ) : (
        reports.map((r) => (
          <div key={r.id} className="panel space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-bold">{r.shop_name}</div>
                <div className="text-xs text-ink-700/60">
                  /{r.shop_slug} · {formatTs(r.created_at)}
                </div>
              </div>
              {status === "open" && (
                <div className="flex gap-1">
                  <button
                    className="btn-primary !px-2 !py-1 text-xs"
                    onClick={() => {
                      setResolveId(r.id);
                      setResolveStatus("resolved");
                    }}
                  >
                    حل
                  </button>
                  <button
                    className="btn-ghost !px-2 !py-1 text-xs"
                    onClick={() => {
                      setResolveId(r.id);
                      setResolveStatus("dismissed");
                    }}
                  >
                    صرف نظر
                  </button>
                </div>
              )}
            </div>
            <div className="text-sm font-semibold">{r.reason}</div>
            {r.details && (
              <pre className="whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-sm">
                {r.details}
              </pre>
            )}
          </div>
        ))
      )}

      {resolveId && (
        <form onSubmit={resolve} className="panel max-w-lg space-y-3">
          <h3 className="font-bold">
            {resolveStatus === "resolved" ? "حل البلاغ" : "صرف النظر"}
          </h3>
          <textarea
            className="field min-h-[80px]"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="ملاحظة / سبب القرار"
            required
          />
          <div className="flex gap-2">
            <button className="btn-primary">تأكيد</button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setResolveId(null)}
            >
              إلغاء
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
