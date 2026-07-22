import type { Hono } from "hono";
import type { Env, AuthPayload } from "../types";

export type AppEnv = {
  Bindings: Env;
  Variables: { auth: AuthPayload };
};

export type App = Hono<AppEnv>;

// تحقق مبسّط من الحقول المطلوبة في جسم الطلب.
export function requireFields<T extends Record<string, unknown>>(
  body: T,
  fields: (keyof T)[],
): string | null {
  for (const field of fields) {
    const value = body[field];
    if (value === undefined || value === null || value === "") {
      return `الحقل «${String(field)}» مطلوب`;
    }
  }
  return null;
}

const SA_PHONE = /^\+9665\d{8}$/;

export function isValidSaudiPhone(phone: string): boolean {
  return SA_PHONE.test(phone);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
