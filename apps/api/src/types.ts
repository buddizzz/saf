import type { ShopQueue } from "./durable-objects/ShopQueue";

export interface Env {
  DB: D1Database;
  SHOP_QUEUE: DurableObjectNamespace<ShopQueue>;
  BRAND_ASSETS: R2Bucket;
  JWT_SECRET: string;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
  /** Meta WhatsApp Cloud API — اختياري محليًا (وضع stub) */
  WHATSAPP_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_TEMPLATE_NAME?: string;
  WHATSAPP_TEMPLATE_LANG?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
  /** AES-256 key material for customer phone encryption */
  PHONE_ENCRYPTION_KEY?: string;
  /** أصل واجهة الويب لروابط إلغاء الاشتراك */
  PUBLIC_WEB_ORIGIN?: string;
  /**
   * فرض 2FA على لوحة الأدمن.
   * "false" يعطّله مؤقتًا للاختبار. في الإنتاج اتركه true أو غير معرّف.
   */
  ADMIN_2FA_REQUIRED?: string;
}

export interface AuthPayload {
  sub: string; // owner id
  email: string;
  role: "owner" | "staff";
  shopScope?: string; // shop id عندما يكون موظفًا
  [key: string]: unknown;
}

export type AdminRole = "super_admin" | "ops_admin" | "support_agent";

export interface AdminAuthPayload {
  sub: string; // admin user id
  email: string;
  role: "admin";
  adminRole: AdminRole;
  pending2fa?: boolean;
  [key: string]: unknown;
}

export type QueueStatus =
  | "waiting"
  | "called"
  | "served"
  | "cancelled"
  | "no_show";

export interface QueueEntry {
  id: string;
  shop_id: string;
  phone: string;
  queue_date: string;
  queue_number: number;
  customer_name: string;
  gender: "male" | "female" | null;
  age_category: string | null;
  status: QueueStatus;
  session_token: string;
  rating: number | null;
  created_at: number;
  called_at: number | null;
  completed_at: number | null;
}

export interface QueueSnapshot {
  shopId: string;
  queueDate: string;
  currentServing: number | null;
  waitingCount: number;
  avgServiceSeconds: number;
  entries: Array<{
    queueNumber: number;
    name: string;
    status: QueueStatus;
    calledAt: number | null;
  }>;
}
