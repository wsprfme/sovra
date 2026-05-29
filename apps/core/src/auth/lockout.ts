interface Attempt {
  count: number;
  firstAt: number;
  lockedUntil: number;
}

export interface LockoutOptions {
  maxAttempts: number;
  windowMs: number;
  lockMs: number;
}

const DEFAULTS: LockoutOptions = {
  maxAttempts: 5,
  windowMs: 60_000,
  lockMs: 300_000,
};

export class LockoutTracker {
  private attempts = new Map<string, Attempt>();
  private readonly opts: LockoutOptions;

  constructor(opts: Partial<LockoutOptions> = {}, private readonly now: () => number = Date.now) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  isLocked(source: string): boolean {
    const a = this.attempts.get(source);
    if (!a) return false;
    if (a.lockedUntil > this.now()) return true;
    if (a.lockedUntil !== 0 && a.lockedUntil <= this.now()) {
      this.attempts.delete(source);
      return false;
    }
    return false;
  }

  recordFailure(source: string): void {
    const t = this.now();
    const a = this.attempts.get(source);
    if (!a || t - a.firstAt > this.opts.windowMs) {
      this.attempts.set(source, { count: 1, firstAt: t, lockedUntil: 0 });
      return;
    }
    a.count += 1;
    if (a.count >= this.opts.maxAttempts) {
      a.lockedUntil = t + this.opts.lockMs;
    }
  }

  recordSuccess(source: string): void {
    this.attempts.delete(source);
  }
}
