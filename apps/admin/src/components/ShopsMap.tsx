import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type Presence = "online" | "offline" | "suspended";

export interface MapShop {
  id: string;
  name: string;
  slug: string;
  shop_type: string;
  subscription_tier: string;
  subscription_status: string;
  is_accepting_queue: number;
  last_activity_at: number | null;
  lat: number | null;
  lng: number | null;
  osm_display_name: string | null;
  presence: Presence;
}

const PRESENCE_COLORS: Record<Presence, string> = {
  online: "#10b981",
  offline: "#f43f5e",
  suspended: "#94a3b8",
};

const PRESENCE_LABELS: Record<Presence, string> = {
  online: "متصل",
  offline: "غير متصل",
  suspended: "موقوف / معطّل",
};

const KSA_CENTER: [number, number] = [24.2, 45.0];

function daysAgo(unix: number | null): string {
  if (!unix) return "لا يوجد نشاط مسجّل";
  const days = Math.floor((Date.now() / 1000 - unix) / 86400);
  if (days <= 0) return "اليوم";
  if (days === 1) return "منذ يوم";
  return `منذ ${days} يومًا`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function ShopsMap({
  shops,
  filter,
}: {
  shops: MapShop[];
  filter: Presence | "all";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  const visible = useMemo(
    () =>
      shops.filter(
        (s) =>
          s.lat != null &&
          s.lng != null &&
          (filter === "all" || s.presence === filter),
      ),
    [shops, filter],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: KSA_CENTER,
      zoom: 5,
      scrollWheelZoom: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setReady(true);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !map || !layer) return;

    layer.clearLayers();
    const bounds: [number, number][] = [];

    for (const shop of visible) {
      const color = PRESENCE_COLORS[shop.presence];
      const marker = L.circleMarker([shop.lat!, shop.lng!], {
        radius: 9,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.75,
      });
      marker.bindPopup(
        `<div dir="rtl" style="font-family:inherit;min-width:190px">
           <div style="font-weight:700">${escapeHtml(shop.name)}</div>
           <div style="font-family:monospace;font-size:11px;direction:ltr;text-align:right">/${escapeHtml(shop.slug)}</div>
           <div style="margin-top:4px;font-size:12px">
             الحالة: <b style="color:${color}">${PRESENCE_LABELS[shop.presence]}</b><br/>
             آخر نشاط: ${daysAgo(shop.last_activity_at)}<br/>
             الاستقبال: ${shop.is_accepting_queue === 1 ? "مفتوح" : "متوقف"}<br/>
             الباقة: ${escapeHtml(shop.subscription_tier)} · ${escapeHtml(shop.subscription_status)}
           </div>
         </div>`,
      );
      marker.addTo(layer);
      bounds.push([shop.lat!, shop.lng!]);
    }

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.2), { maxZoom: 12 });
    }
  }, [ready, visible]);

  return (
    <div className="overflow-hidden rounded-xl border border-ink-100">
      <div ref={containerRef} style={{ height: 480 }} />
    </div>
  );
}
