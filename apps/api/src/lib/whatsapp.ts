/** مرسل واتساب Business Cloud API — قوالب تسويقية + نص حر داخل نافذة 24 ساعة + stub محلي. */

export async function hashPhone(phone: string): Promise<string> {
  const data = new TextEncoder().encode(phone);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface WhatsAppEnv {
  WHATSAPP_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  /** اسم قالب Meta المعتمد للحملات (مثل saf_marketing) */
  WHATSAPP_TEMPLATE_NAME?: string;
  WHATSAPP_TEMPLATE_LANG?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
}

export async function sendWhatsAppMessage(
  env: WhatsAppEnv,
  toPhone: string,
  body: string,
  opts?: { customerName?: string | null; shopName?: string | null },
): Promise<{ messageId: string; stub: boolean; mode: "stub" | "template" | "text" }> {
  const token = env.WHATSAPP_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();

  if (!token || !phoneNumberId) {
    const id = `stub_${crypto.randomUUID()}`;
    console.log(
      `[whatsapp-stub] to=${toPhone} len=${body.length} id=${id}`,
    );
    return { messageId: id, stub: true, mode: "stub" };
  }

  const to = toPhone.replace(/^\+/, "");
  const templateName = env.WHATSAPP_TEMPLATE_NAME?.trim();
  const templateLang = env.WHATSAPP_TEMPLATE_LANG?.trim() || "ar";

  // الحملات التسويقية خارج نافذة 24 ساعة تتطلب قالبًا معتمدًا من Meta.
  const payload = templateName
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLang },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: (opts?.customerName || "عميلنا").slice(0, 60) },
                { type: "text", text: (opts?.shopName || "المحل").slice(0, 60) },
                { type: "text", text: body.slice(0, 900) },
              ],
            },
          ],
        },
      }
    : {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: body.slice(0, 4096) },
      };

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp API ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    messages?: Array<{ id?: string }>;
  };
  const messageId = json.messages?.[0]?.id ?? `wa_${crypto.randomUUID()}`;
  return {
    messageId,
    stub: false,
    mode: templateName ? "template" : "text",
  };
}
