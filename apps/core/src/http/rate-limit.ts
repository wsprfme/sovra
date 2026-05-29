export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly opts: RateLimitOptions,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitResult {
    const t = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= t) {
      this.buckets.set(key, { count: 1, resetAt: t + this.opts.windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (bucket.count >= this.opts.max) {
      return { allowed: false, retryAfterMs: bucket.resetAt - t };
    }
    bucket.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  reset(): void {
    this.buckets.clear();
  }
}
