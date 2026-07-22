/** Lightweight id for admin-created location rows (not crypto-secure). */
export function generateId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}
