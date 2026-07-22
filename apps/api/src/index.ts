import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./lib/http";
import type { Env } from "./types";
import { authRoutes } from "./routes/auth";
import { shopRoutes } from "./routes/shops";
import { locationRoutes } from "./routes/locations";
import { queueRoutes } from "./routes/queue";
import { staffRoutes } from "./routes/staff";
import { assetRoutes } from "./routes/assets";
import { subscriptionRoutes } from "./routes/subscription";
import { bookingRoutes } from "./routes/booking";
import { adminRoutes } from "./routes/admin";
import { campaignRoutes } from "./routes/campaigns";
import { billingRoutes } from "./routes/billing";
import { marketingRoutes } from "./routes/marketing";
import { whatsappWebhookRoutes } from "./routes/whatsapp-webhook";
import { runCampaignCron } from "./cron/send-campaigns";

export { ShopQueue } from "./durable-objects/ShopQueue";

const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const handler = cors({
    origin: (origin) => (allowed.includes(origin) ? origin : allowed[0] ?? "*"),
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });
  return handler(c, next);
});

// HSTS في الإنتاج
app.use("*", async (c, next) => {
  await next();
  if (c.env.ENVIRONMENT === "production") {
    c.res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }
});

app.get("/health", (c) => c.json({ ok: true, service: "saf-api" }));

app.route("/auth", authRoutes);
app.route("/staff", staffRoutes);
app.route("/shops", shopRoutes);
app.route("/shops", subscriptionRoutes);
app.route("/shops", campaignRoutes);
app.route("/shops", billingRoutes);
app.route("/locations", locationRoutes);
app.route("/queue", queueRoutes);
app.route("/assets", assetRoutes);
app.route("/", bookingRoutes);
app.route("/", marketingRoutes);
app.route("/", whatsappWebhookRoutes);
app.route("/admin", adminRoutes);

app.notFound((c) => c.json({ error: "المسار غير موجود" }, 404));
app.onError((err, c) => {
  console.error("API error:", err);
  return c.json({ error: "خطأ داخلي في الخادم" }, 500);
});

const worker = {
  fetch: app.fetch,
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ) {
    const result = await runCampaignCron(env);
    console.log("campaign cron", result);
  },
};

export default worker;
