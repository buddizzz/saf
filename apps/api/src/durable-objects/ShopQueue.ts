import { DurableObject } from "cloudflare:workers";
import type { Env } from "../types";
import { callNext, getSnapshot, skipCurrent } from "../lib/queue";

const NO_SHOW_SECONDS = 180;

// كائن دائم لكل محل: يبثّ حالة الطابور الحية عبر WebSocket
// ويدير مؤقّت الغياب (no-show) عبر Alarms API.
export class ShopQueue extends DurableObject<Env> {
  private shopId: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.shopId = (await ctx.storage.get<string>("shopId")) ?? null;
    });
  }

  private async ensureShopId(shopId?: string): Promise<string | null> {
    if (shopId && shopId !== this.shopId) {
      this.shopId = shopId;
      await this.ctx.storage.put("shopId", shopId);
    }
    return this.shopId;
  }

  // ترقية اتصال WebSocket (يُوجّه من الـ Worker).
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    await this.ensureShopId(url.searchParams.get("shopId") ?? undefined);

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);

    if (this.shopId) {
      const snapshot = await getSnapshot(this.env.DB, this.shopId);
      server.send(JSON.stringify({ type: "snapshot", data: snapshot }));
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message === "string" && message === "ping") {
      ws.send("pong");
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code, "closing");
    } catch {
      // تجاهل: قد يكون الاتصال مغلقًا بالفعل
    }
  }

  // بثّ الحالة الحالية لكل العملاء المتصلين.
  async broadcast(shopId?: string): Promise<void> {
    const id = await this.ensureShopId(shopId);
    if (!id) return;
    const snapshot = await getSnapshot(this.env.DB, id);
    const payload = JSON.stringify({ type: "snapshot", data: snapshot });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // تجاهل الاتصالات المعطوبة
      }
    }
  }

  // يُستدعى بعد "استدعاء التالي": يبدأ مؤقّت الغياب ثم يبثّ.
  async onCustomerCalled(shopId: string): Promise<void> {
    await this.ensureShopId(shopId);
    await this.ctx.storage.setAlarm(Date.now() + NO_SHOW_SECONDS * 1000);
    await this.broadcast(shopId);
  }

  // انتهاء مهلة الغياب: علّم العميل الحالي كـ no_show واستدعِ التالي.
  async alarm(): Promise<void> {
    if (!this.shopId) return;
    await skipCurrent(this.env.DB, this.shopId, "no_show");
    const nextNumber = await callNext(this.env.DB, this.shopId);
    if (nextNumber !== null) {
      await this.ctx.storage.setAlarm(Date.now() + NO_SHOW_SECONDS * 1000);
    }
    await this.broadcast(this.shopId);
  }
}
