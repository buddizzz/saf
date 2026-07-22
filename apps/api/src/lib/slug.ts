// توليد رابط عشوائي قصير (base62 بدون رموز متشابهة) للباقة المجانية.
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // بدون 0/o/1/l/i
const CUSTOM_SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$/;

export function generateSlug(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

/** يتحقق من صيغة الـ slug المخصص (Pro). */
export function normalizeCustomSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  if (slug.length < 3 || slug.length > 30) return null;
  if (!CUSTOM_SLUG_RE.test(slug)) return null;
  if (slug.includes("--")) return null;
  return slug;
}
