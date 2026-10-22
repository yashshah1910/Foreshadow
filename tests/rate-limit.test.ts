import { describe, expect, it } from "vitest";
import { rateLimit, waitPhrase } from "@/lib/rate-limit";

describe("rateLimit", () => {
  const limits = [
    { max: 2, windowMs: 60_000 },
    { max: 3, windowMs: 3_600_000 },
  ];

  it("allows up to the per-minute cap, then reports the wait", () => {
    const t0 = 1_000_000;
    expect(rateLimit("t1", "1.1.1.1", limits, t0).ok).toBe(true);
    expect(rateLimit("t1", "1.1.1.1", limits, t0 + 1_000).ok).toBe(true);
    const third = rateLimit("t1", "1.1.1.1", limits, t0 + 2_000);
    expect(third).toEqual({ ok: false, retryAfter: 58 });
  });

  it("applies the longer window after the short one resets", () => {
    const t0 = 5_000_000;
    rateLimit("t2", "2.2.2.2", limits, t0);
    rateLimit("t2", "2.2.2.2", limits, t0 + 1_000);
    expect(rateLimit("t2", "2.2.2.2", limits, t0 + 61_000).ok).toBe(true);
    const fourth = rateLimit("t2", "2.2.2.2", limits, t0 + 122_000);
    expect(fourth.ok).toBe(false);
  });

  it("keeps IPs and buckets separate", () => {
    const t0 = 9_000_000;
    rateLimit("t3", "3.3.3.3", limits, t0);
    rateLimit("t3", "3.3.3.3", limits, t0);
    expect(rateLimit("t3", "4.4.4.4", limits, t0).ok).toBe(true);
    expect(rateLimit("t3b", "3.3.3.3", limits, t0).ok).toBe(true);
  });

  it("phrases waits for people", () => {
    expect(waitPhrase(40)).toBe("about 40 seconds");
    expect(waitPhrase(720)).toBe("about 12 minutes");
    expect(waitPhrase(3 * 3600)).toBe("about 3 hours");
  });
});
