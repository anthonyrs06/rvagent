/**
 * Sliding-window in-memory rate limiter. Sufficient for a single local
 * process; swap for Redis/Firestore when running multiple instances on
 * Cloud Run (see NOTES.md).
 */

interface Bucket {
  hits: number[];
}

declare global {
  // eslint-disable-next-line no-var
  var __rvRateBuckets: Map<string, Bucket> | undefined;
}

const buckets: Map<string, Bucket> = globalThis.__rvRateBuckets ?? new Map();
globalThis.__rvRateBuckets = buckets;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= max) {
    buckets.set(key, bucket);
    return { allowed: false, retryAfterMs: windowMs - (now - bucket.hits[0]) };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);

  // Opportunistic prune so the map doesn't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) {
      if (b.hits.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return { allowed: true, retryAfterMs: 0 };
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "local";
}
