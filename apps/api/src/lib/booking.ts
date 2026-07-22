// حساب فتحات الحجز من إعدادات التوفّر والمواعيد المحجوزة.

export interface AvailabilityRow {
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
}

export interface BookedSlot {
  appointment_time: number;
  duration_minutes: number;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

function parseHm(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function minutesToHm(total: number): string {
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** يوم الأسبوع بأسلوب الخطة: 0=الأحد … 6=السبت */
export function dayOfWeekSunday0(date: Date): number {
  return date.getUTCDay();
}

export function buildSlotsForDay(
  day: Date,
  availability: AvailabilityRow | undefined,
  booked: BookedSlot[],
  nowUnix: number,
): string[] {
  if (!availability) return [];
  const duration = availability.slot_duration_minutes;
  if (duration < 5 || duration > 240) return [];

  const start = parseHm(availability.start_time);
  const end = parseHm(availability.end_time);
  if (end <= start) return [];

  const y = day.getUTCFullYear();
  const mo = day.getUTCMonth();
  const d = day.getUTCDate();
  const slots: string[] = [];

  for (let t = start; t + duration <= end; t += duration) {
    const slotStart = Date.UTC(y, mo, d, Math.floor(t / 60), t % 60) / 1000;
    if (slotStart <= nowUnix) continue;

    const overlaps = booked.some((b) => {
      const bEnd = b.appointment_time + b.duration_minutes * 60;
      const slotEnd = slotStart + duration * 60;
      return slotStart < bEnd && slotEnd > b.appointment_time;
    });
    if (!overlaps) slots.push(minutesToHm(t));
  }
  return slots;
}

export function slotUnix(
  dateYmd: string,
  timeHm: string,
): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd) || !isValidTime(timeHm)) return null;
  const [y, m, d] = dateYmd.split("-").map(Number);
  const [hh, mm] = timeHm.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) / 1000;
}

export function ymdUTC(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDaysUTC(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
