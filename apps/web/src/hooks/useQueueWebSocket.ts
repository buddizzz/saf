import { useEffect, useRef, useState } from "react";
import { queueWsUrl } from "../lib/api";
import type { QueueSnapshot } from "../lib/types";

export type ConnectionState = "connecting" | "connected" | "reconnecting";

const MAX_BACKOFF_MS = 30_000;
const HEARTBEAT_MS = 30_000;

// اتصال WebSocket بالطابور مع إعادة اتصال تلقائي (exponential backoff) و heartbeat.
export function useQueueWebSocket(shopId: string | null) {
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [status, setStatus] = useState<ConnectionState>("connecting");
  const attemptRef = useRef(0);
  const closedRef = useRef(false);

  useEffect(() => {
    if (!shopId) return;
    closedRef.current = false;
    let ws: WebSocket | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      setStatus(attemptRef.current === 0 ? "connecting" : "reconnecting");
      ws = new WebSocket(queueWsUrl(shopId));

      ws.onopen = () => {
        attemptRef.current = 0;
        setStatus("connected");
        heartbeat = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send("ping");
        }, HEARTBEAT_MS);
      };

      ws.onmessage = (event) => {
        if (event.data === "pong") return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "snapshot") setSnapshot(msg.data as QueueSnapshot);
        } catch {
          // تجاهل الرسائل غير المتوقعة
        }
      };

      ws.onclose = () => {
        if (heartbeat) clearInterval(heartbeat);
        if (closedRef.current) return;
        const delay = Math.min(
          1000 * 2 ** attemptRef.current,
          MAX_BACKOFF_MS,
        );
        attemptRef.current += 1;
        setStatus("reconnecting");
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => ws?.close();
    };

    connect();

    return () => {
      closedRef.current = true;
      if (heartbeat) clearInterval(heartbeat);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [shopId]);

  return { snapshot, status };
}
