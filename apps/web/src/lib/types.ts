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
  avg_service_seconds: number;
  theme_id: string;
  logo_url: string | null;
}

export interface PublicShop {
  id: string;
  name: string;
  slug: string;
  shop_type: string;
  theme_id: string;
  logo_url: string | null;
  isOpen: boolean;
  closedReason: string | null;
  subscription_tier: string;
  avg_service_seconds: number;
}
