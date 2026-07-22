import type { ShopQueue } from "./durable-objects/ShopQueue";

export interface Env {
  DB: D1Database;
  SHOP_QUEUE: DurableObjectNamespace<ShopQueue>;
  BRAND_ASSETS: R2Bucket;
  JWT_SECRET: string;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
}

export interface AuthPayload {
  sub: string; // owner id
  email: string;
  role: "owner" | "staff";
  shopScope?: string; // shop id عندما يكون موظفًا
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
