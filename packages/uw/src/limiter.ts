/**
 * Token-bucket rate limiter with an externally imposed pause.
 *
 * The bucket starts full (`perMinute` tokens) and refills continuously at
 * `perMinute / 60s`. `acquire()` calls are served strictly in order so a burst
 * of concurrent `Promise.all` fetches never exceeds the configured rate.
 * `pauseFor(ms)` is used by the HTTP layer when UW reports zero requests left
 * in the current minute window (`x-uw-req-per-minute-remaining: 0`).
 */

export interface LimiterClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: LimiterClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class TokenBucket {
  private readonly perMinute: number;
  private tokens: number;
  private last: number;
  private pauseUntil = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(perMinute: number, private readonly clock: LimiterClock = realClock) {
    this.perMinute = Math.max(1, perMinute);
    this.tokens = this.perMinute;
    this.last = clock.now();
  }

  /**
   * Resolves `true` when a token has been taken. Callers are served FIFO.
   * With `deadlineAt`, resolves `false` without a token once that time has
   * passed, so a queue of waiters drains at once instead of one per token.
   */
  acquire(deadlineAt?: number): Promise<boolean> {
    const next = this.chain.then(() => this.take(deadlineAt));
    this.chain = next.then(() => undefined, () => undefined);
    return next;
  }

  /** Block every caller until `now + ms` (never shortens an existing pause). */
  pauseFor(ms: number): void {
    if (ms > 0) this.pauseUntil = Math.max(this.pauseUntil, this.clock.now() + ms);
  }

  /** Whole tokens currently available (diagnostics only). */
  get available(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  private refill(): void {
    const t = this.clock.now();
    const elapsed = Math.max(0, t - this.last);
    this.last = t;
    this.tokens = Math.min(this.perMinute, this.tokens + (elapsed * this.perMinute) / 60_000);
  }

  private async take(deadlineAt?: number): Promise<boolean> {
    for (;;) {
      if (deadlineAt !== undefined && this.clock.now() > deadlineAt) return false;
      this.refill();
      const pauseWait = this.pauseUntil - this.clock.now();
      if (this.tokens >= 1 && pauseWait <= 0) {
        this.tokens -= 1;
        return true;
      }
      const tokenWait = this.tokens >= 1 ? 0 : ((1 - this.tokens) * 60_000) / this.perMinute;
      let wait = Math.max(pauseWait, tokenWait);
      if (deadlineAt !== undefined) wait = Math.min(wait, deadlineAt - this.clock.now() + 1);
      await this.clock.sleep(Math.max(1, Math.ceil(wait)));
    }
  }
}
