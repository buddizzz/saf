export function formatTs(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatMoney(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return `${v.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س`;
}
