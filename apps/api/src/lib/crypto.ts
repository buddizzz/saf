// تجزئة كلمات المرور: Argon2id (@noble/hashes) مع دعم التحقق من PBKDF2 القديم.

import { argon2id } from "@noble/hashes/argon2.js";

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

// معاملات Argon2id مناسبة لـ Workers (ذاكرة محدودة)
const ARGON2_OPTS = {
  t: 2,
  m: 16_384, // 16 MiB
  p: 1,
  dkLen: 32,
};

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

async function derivePbkdf2(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** تجزئة جديدة بـ Argon2id. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = argon2id(password, salt, ARGON2_OPTS);
  return `argon2id$${ARGON2_OPTS.t}$${ARGON2_OPTS.m}$${ARGON2_OPTS.p}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts[0] === "argon2id" && parts.length === 6) {
    const t = Number(parts[1]);
    const m = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = fromBase64(parts[4]);
    const expected = fromBase64(parts[5]);
    const actual = argon2id(password, salt, { t, m, p, dkLen: expected.length });
    return timingSafeEqual(actual, expected);
  }
  // توافق خلفي مع PBKDF2
  if (parts[0] === "pbkdf2" && parts.length === 4) {
    const salt = fromBase64(parts[2]);
    const expected = fromBase64(parts[3]);
    const actual = await derivePbkdf2(password, salt);
    return timingSafeEqual(actual, expected);
  }
  return false;
}

/** true إن كانت التجزئة قديمة ويُفضّل إعادة التجزئة عند الدخول. */
export function needsRehash(stored: string): boolean {
  return !stored.startsWith("argon2id$");
}

export function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return toBase64(buf)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
