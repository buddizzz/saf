export type QueueStatus =
  | "waiting"
  | "called"
  | "served"
  | "cancelled"
  | "no_show";

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

export interface Shop {
  id: string;
  name: string;
  slug: string;
  shop_type: string;
  is_accepting_queue: number;
  is_active: number;
  subscription_tier: string;
  subscription_status?: string;
  subscription_renews_at?: number | null;
  hide_powered_by?: number;
  avg_service_seconds: number;
  theme_id: string;
  theme_custom: string | null;
  working_hours: string | null;
  logo_url: string | null;
  tagline: string | null;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  is_active: number;
}

export type WorkingHours = Record<
  string,
  { open: string; close: string } | null
>;

export interface PublicShop {
  id: string;
  name: string;
  slug: string;
  shop_type: string;
  theme_id: string;
  theme_custom: string | null;
  logo_url: string | null;
  tagline: string | null;
  isOpen: boolean;
  closedReason: string | null;
  subscription_tier: string;
  hide_powered_by?: number;
  booking_enabled?: boolean;
  avg_service_seconds: number;
}
