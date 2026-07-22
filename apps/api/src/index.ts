import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./lib/http";
import { authRoutes } from "./routes/auth";
import { shopRoutes } from "./routes/shops";
import { locationRoutes } from "./routes/locations";
import { queueRoutes } from "./routes/queue";
import { staffRoutes } from "./routes/staff";
import { assetRoutes } from "./routes/assets";

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

app.get("/health", (c) => c.json({ ok: true, service: "saf-api" }));

app.route("/auth", authRoutes);
app.route("/staff", staffRoutes);
app.route("/shops", shopRoutes);
app.route("/locations", locationRoutes);
app.route("/queue", queueRoutes);
app.route("/assets", assetRoutes);

app.notFound((c) => c.json({ error: "المسار غير موجود" }, 404));
app.onError((err, c) => {
  console.error("API error:", err);
  return c.json({ error: "خطأ داخلي في الخادم" }, 500);
});

export default app;
