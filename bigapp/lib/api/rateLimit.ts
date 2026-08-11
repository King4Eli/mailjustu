// Fixed-window brute-force throttle -- a plain module-level Map, same
// pattern (and same single-long-running-process assumption) as auth.ts's
// session store. Counts failed attempts only, per caller-chosen key, so a
// user who mistypes their password a couple of times but then gets it
// right isn't penalized.
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitStatus {
  limited: boolean;
  retryAfterSeconds: number;
}

export function isRateLimited(key: string, max: number): RateLimitStatus {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now)
    return { limited: false, retryAfterSeconds: 0 };
  if (bucket.count >= max) {
    return {
      limited: true,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

export function recordFailedAttempt(key: string, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    bucket.count += 1;
  }
}

export function clearAttempts(key: string) {
  buckets.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref();
