/**
 * TOTP (RFC 6238) عبر Web Crypto — لأدمن المنصة (2FA إلزامي بعد التفعيل).
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

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(bytes = 20): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5);
    if (chunk.length < 5) break;
    out += BASE32[parseInt(chunk, 2)];
  }
  return out;
}

function base32ToBytes(secret: string): Uint8Array {
  const cleaned = secret.replace(/=+$/, "").toUpperCase();
  let bits = "";
  for (const ch of cleaned) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

async function hotp(secret: string, counter: number): Promise<string> {
  const keyData = base32ToBytes(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // big-endian 64-bit counter (high 32 always 0 for practical counters)
  view.setUint32(0, 0);
  view.setUint32(4, counter >>> 0);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));
  const offset = sig[sig.length - 1] & 0x0f;
  const code =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}

export async function verifyTotp(
  secret: string,
  token: string,
  window = 1,
): Promise<boolean> {
  const clean = String(token).replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const step = Math.floor(Date.now() / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    const expected = await hotp(secret, step + w);
    if (expected === clean) return true;
  }
  return false;
}

export function totpOtpauthUrl(opts: {
  secret: string;
  email: string;
  issuer?: string;
}): string {
  const issuer = encodeURIComponent(opts.issuer ?? "SAF Admin");
  const label = encodeURIComponent(`SAF:${opts.email}`);
  return `otpauth://totp/${label}?secret=${opts.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

/** رمز مؤقت قصير العمر لخطوة 2FA بعد كلمة المرور. */
export function packPending2fa(adminId: string, secretPepper: string): string {
  const exp = Math.floor(Date.now() / 1000) + 300;
  const payload = `${adminId}.${exp}`;
  // soft binding — التوقيع الفعلي عبر JWT في المسار المفضّل
  return toBase64(new TextEncoder().encode(`${payload}.${secretPepper.slice(0, 8)}`));
}

export function unpackPending2fa(
  token: string,
): { adminId: string; exp: number } | null {
  try {
    const raw = new TextDecoder().decode(fromBase64(token));
    const [adminId, expStr] = raw.split(".");
    const exp = Number(expStr);
    if (!adminId || !exp || exp < Math.floor(Date.now() / 1000)) return null;
    return { adminId, exp };
  } catch {
    return null;
  }
}
