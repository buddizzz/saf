/** مرسل واتساب Business API — يحاكي الإرسال محليًا إن لم يُضبط التوكن. */

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
}

export async function sendWhatsAppMessage(
  env: WhatsAppEnv,
  toPhone: string,
  body: string,
): Promise<{ messageId: string; stub: boolean }> {
  const token = env.WHATSAPP_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();

  // بدون أسرار Meta: وضع تطوير يُسجّل الرسالة كـ مُرسلة (stub).
  if (!token || !phoneNumberId) {
    const id = `stub_${crypto.randomUUID()}`;
    console.log(
      `[whatsapp-stub] to=${toPhone} len=${body.length} id=${id}`,
    );
    return { messageId: id, stub: true };
  }

  const to = toPhone.replace(/^\+/, "");
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: body.slice(0, 4096) },
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp API ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    messages?: Array<{ id?: string }>;
  };
  const messageId = json.messages?.[0]?.id ?? `wa_${crypto.randomUUID()}`;
  return { messageId, stub: false };
}
