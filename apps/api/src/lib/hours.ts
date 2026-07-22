// حساب ما إذا كان المحل ضمن ساعات العمل الحالية (بتوقيت السعودية).
// working_hours صيغته JSON: { "sun": {"open":"09:00","close":"22:00"}, ... }
// غياب القيمة أو غياب اليوم يعني أن المحل مفتوح (لا قيد بساعات).

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function isWithinWorkingHours(workingHoursJson: string | null): boolean {
  if (!workingHoursJson) return true;
  let hours: Record<string, { open: string; close: string } | null>;
  try {
    hours = JSON.parse(workingHoursJson);
  } catch {
    return true;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";

  const dayKey = DAYS[
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday)
  ];
  const today = dayKey ? hours[dayKey] : null;
  if (!today) return true;

  const nowMinutes = Number(hour) * 60 + Number(minute);
  const [oh, om] = today.open.split(":").map(Number);
  const [ch, cm] = today.close.split(":").map(Number);
  return nowMinutes >= oh * 60 + om && nowMinutes <= ch * 60 + cm;
}
