/**
 * Per-IP rate limits for the routes that spend Claude credits. Sliding
 * windows kept in memory: on Vercel each warm instance has its own count,
 * which is enough to stop one visitor from draining the key.
 */

export interface Limit {
  max: number;
  windowMs: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Ask: a few questions a minute, a handful an hour, a cap per day. */
export const ASK_LIMITS: Limit[] = [
  { max: 3, windowMs: MINUTE },
  { max: 12, windowMs: HOUR },
  { max: 40, windowMs: 24 * HOUR },
];

/** Summaries are cached after the first write; this only bounds fresh writes. */
/** Sign-in emails: enough for a typo or two, not enough to spam anyone through our sender. */
export const SIGN_IN_LIMITS: Limit[] = [
  { max: 3, windowMs: 10 * MINUTE },
  { max: 10, windowMs: 24 * HOUR },
];

export const SUMMARY_LIMITS: Limit[] = [
  { max: 20, windowMs: 10 * MINUTE },
  { max: 120, windowMs: 24 * HOUR },
];

const hits = new Map<string, number[]>();
const LONGEST = 24 * HOUR;

export function clientIp(request: Request): string {
  const h = request.headers;
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/** Records the hit when allowed; otherwise says how many seconds until the next one is. */
export function rateLimit(bucket: string, ip: string, limits: Limit[], now = Date.now()): { ok: true } | { ok: false; retryAfter: number } {
  const key = `${bucket}:${ip}`;
  const times = (hits.get(key) ?? []).filter((t) => now - t < LONGEST);
  for (const { max, windowMs } of limits) {
    const inWindow = times.filter((t) => now - t < windowMs);
    if (inWindow.length >= max) {
      const retryAfter = Math.ceil((inWindow[0] + windowMs - now) / 1000);
      hits.set(key, times);
      return { ok: false, retryAfter: Math.max(1, retryAfter) };
    }
  }
  times.push(now);
  hits.set(key, times);
  if (hits.size > 10_000) {
    for (const [k, ts] of hits) if (!ts.some((t) => now - t < LONGEST)) hits.delete(k);
  }
  return { ok: true };
}

/** "about 40 seconds" / "about 12 minutes" / "about 3 hours". */
export function waitPhrase(seconds: number): string {
  if (seconds < 90) return `about ${seconds} seconds`;
  if (seconds < 90 * 60) return `about ${Math.round(seconds / 60)} minutes`;
  return `about ${Math.round(seconds / 3600)} hours`;
}
