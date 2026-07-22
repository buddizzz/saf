/**
 * حدود معدّل الطلبات داخل الـ Worker (best-effort لكل isolate).
 * للإنتاج يُفضَّل تفعيل Cloudflare Rate Limiting Rules على الحافة أيضًا.
 */

type Bucket = { count: number; resetAt: number; lockUntil?: number };

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  opts?: { lockMs?: number },
): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (bucket?.lockUntil && bucket.lockUntil > now) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.ceil((bucket.lockUntil - now) / 1000),
    };
  }
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    if (opts?.lockMs) {
      const locks = Math.min(bucket.count - limit, 5);
      bucket.lockUntil = now + opts.lockMs * locks;
    }
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.ceil(
        ((bucket.lockUntil ?? bucket.resetAt) - now) / 1000,
      ),
    };
  }
  // تنظيف دوري بسيط
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.resetAt < now && (!v.lockUntil || v.lockUntil < now)) {
        buckets.delete(k);
      }
    }
  }
  return {
    ok: true,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSec: 0,
  };
}

export function clientIp(c: {
  req: { header: (name: string) => string | undefined };
}): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}
