/**
 * تشفير رقم الجوال على مستوى التطبيق (AES-256-GCM).
 * المفتاح من Worker Secret: PHONE_ENCRYPTION_KEY (32 بايت base64 أو hex أو نص طويل).
 * بدون مفتاح: يُحفظ النص واضحًا (تطوير محلي).
 */

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export function hasPhoneEncryption(env: { PHONE_ENCRYPTION_KEY?: string }): boolean {
  return Boolean(env.PHONE_ENCRYPTION_KEY?.trim());
}

/** يشفّر الجوال؛ يعيد null إن لم يُضبط المفتاح. */
export async function encryptPhone(
  env: { PHONE_ENCRYPTION_KEY?: string },
  phone: string,
): Promise<string | null> {
  const secret = env.PHONE_ENCRYPTION_KEY?.trim();
  if (!secret) return null;
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(phone),
  );
  const packed = new Uint8Array(iv.length + new Uint8Array(ct).length);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ct), iv.length);
  return `enc:v1:${toBase64(packed)}`;
}

export async function decryptPhone(
  env: { PHONE_ENCRYPTION_KEY?: string },
  cipherOrPhone: string | null | undefined,
): Promise<string | null> {
  if (!cipherOrPhone) return null;
  if (!cipherOrPhone.startsWith("enc:v1:")) return cipherOrPhone;
  const secret = env.PHONE_ENCRYPTION_KEY?.trim();
  if (!secret) return null;
  const key = await deriveKey(secret);
  const packed = fromBase64(cipherOrPhone.slice("enc:v1:".length));
  const iv = packed.slice(0, 12);
  const data = packed.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(pt);
}

/** HMAC للبحث الداخلي دون كشف الرقم (اختياري للمستقبل). */
export async function phoneHmac(
  env: { PHONE_ENCRYPTION_KEY?: string },
  phone: string,
): Promise<string> {
  const secret = env.PHONE_ENCRYPTION_KEY?.trim() || "dev-phone-hmac";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(phone),
  );
  return toBase64(new Uint8Array(sig));
}
