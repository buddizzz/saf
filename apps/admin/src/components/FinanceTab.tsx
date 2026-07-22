import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "../lib/api";
import { formatMoney, formatTs } from "../lib/format";

interface FinanceOverview {
  shops_with_balance: number;
  total_balance: number;
  credited: number;
  debited: number;
  bonuses: number;
  payment_count: number;
  campaign_spend: number;
}

interface PaymentRow {
  id: string;
  shop_id: string;
  shop_name: string;
  shop_slug: string;
  amount: number;
  bonus_amount: number;
  provider: string | null;
  status: string;
  note: string | null;
  created_at: number;
}

export function FinanceTab() {
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const [fin, pay] = await Promise.all([
      adminFetch<{ finance: FinanceOverview }>("/admin/finance/overview"),
      adminFetch<{ payments: PaymentRow[] }>(
        `/admin/payments?q=${encodeURIComponent(query)}&limit=50`,
      ),
    ]);
    setOverview(fin.finance);
    setPayments(pay.payments);
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      {overview && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["إجمالي أرصدة المحلات", formatMoney(overview.total_balance)],
            ["محلات برصيد", overview.shops_with_balance],
            ["شحن مكتمل", formatMoney(overview.credited)],
            ["خصم / استهلاك", formatMoney(overview.debited)],
            ["مكافآت حجم", formatMoney(overview.bonuses)],
            ["إنفاق حملات", formatMoney(overview.campaign_spend)],
          ].map(([label, value]) => (
            <div key={String(label)} className="panel">
              <div className="text-xs font-semibold text-ink-700/60">{label}</div>
              <div className="mt-1 text-xl font-bold text-ink-900">{value}</div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-ink-700/60">
        بوابة الدفع مؤجّلة — الأرقام الحالية من الشحن اليدوي واستهلاك الحملات.
      </p>

      <div className="flex gap-2">
        <input
          className="field max-w-sm"
          placeholder="بحث محل / ملاحظة"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn-ghost" onClick={() => void load()}>
          بحث
        </button>
      </div>

      <div className="panel overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-ink-100 bg-ink-50 text-xs text-ink-700/70">
            <tr>
              <th className="px-4 py-3 text-right">المحل</th>
              <th className="px-4 py-3 text-right">المبلغ</th>
              <th className="px-4 py-3 text-right">مكافأة</th>
              <th className="px-4 py-3 text-right">المزوّد</th>
              <th className="px-4 py-3 text-right">ملاحظة</th>
              <th className="px-4 py-3 text-right">التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-ink-50">
                <td className="px-4 py-3">
                  <div className="font-semibold">{p.shop_name}</div>
                  <div className="font-mono text-xs text-ink-700/60" dir="ltr">
                    /{p.shop_slug}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono">{formatMoney(p.amount)}</td>
                <td className="px-4 py-3 font-mono">
                  {formatMoney(p.bonus_amount)}
                </td>
                <td className="px-4 py-3">{p.provider ?? "—"}</td>
                <td className="px-4 py-3 text-ink-700/70">{p.note ?? "—"}</td>
                <td className="px-4 py-3 text-xs">{formatTs(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && (
          <div className="p-4 text-sm text-ink-700/60">لا مدفوعات</div>
        )}
      </div>
    </div>
  );
}
