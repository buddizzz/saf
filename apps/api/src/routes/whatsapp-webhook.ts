import { Hono } from "hono";
import type { AppEnv } from "../lib/http";

export const whatsappWebhookRoutes = new Hono<AppEnv>();

/** تحقق اشتراك Webhook من Meta (GET). */
whatsappWebhookRoutes.get("/webhooks/whatsapp", async (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  const expected = c.env.WHATSAPP_VERIFY_TOKEN?.trim();

  if (mode === "subscribe" && expected && token === expected && challenge) {
    return c.text(challenge, 200);
  }
  return c.json({ error: "verification failed" }, 403);
});

/** تحديثات التسليم/القراءة من Meta. */
whatsappWebhookRoutes.post("/webhooks/whatsapp", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: true });

  try {
    const entries = (body as { entry?: unknown[] }).entry ?? [];
    for (const entry of entries as Array<{
      changes?: Array<{
        value?: {
          statuses?: Array<{
            id?: string;
            status?: string;
            timestamp?: string;
          }>;
        };
      }>;
    }>) {
      for (const change of entry.changes ?? []) {
        for (const st of change.value?.statuses ?? []) {
          if (!st.id || !st.status) continue;
          const mapped =
            st.status === "delivered"
              ? "delivered"
              : st.status === "read"
                ? "read"
                : st.status === "failed"
                  ? "failed"
                  : st.status === "sent"
                    ? "sent"
                    : null;
          if (!mapped) continue;
          const sentAt = st.timestamp ? Number(st.timestamp) : null;
          await c.env.DB.prepare(
            `UPDATE campaign_messages
             SET status = ?, sent_at = COALESCE(sent_at, ?)
             WHERE wa_message_id = ?`,
          )
            .bind(mapped, sentAt, st.id)
            .run();
        }
      }
    }
  } catch (err) {
    console.error("whatsapp webhook parse error", err);
  }

  return c.json({ ok: true });
});
