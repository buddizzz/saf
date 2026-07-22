// توليد رابط عشوائي قصير (base62 بدون رموز متشابهة) للباقة المجانية.
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // بدون 0/o/1/l/i

export function generateSlug(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}
