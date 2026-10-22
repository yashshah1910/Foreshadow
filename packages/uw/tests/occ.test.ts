import { describe, expect, it } from "vitest";
import { parseOccSymbol } from "../src/occ";
import { TokenBucket } from "../src/limiter";
import { etTradeDate, num, numOpt, slugify, stableHash } from "../src/util";
import { nextMonthlyExpiry, thirdFriday } from "../src/expiry";
import { volumePercentile } from "../src/volume";
import type { DailyOptionVolume } from "../src/types";

describe("parseOccSymbol", () => {
  it("parses a standard call", () => {
    expect(parseOccSymbol("MSFT231222C00375000")).toEqual({
      symbol: "MSFT",
      expiry: "2023-12-22",
      type: "call",
      strike: 375,
      raw: "MSFT231222C00375000",
    });
  });

  it("parses puts, fractional strikes and roots with digits or dots", () => {
    expect(parseOccSymbol("SPXW240119P04500000")).toMatchObject({ symbol: "SPXW", type: "put", strike: 4500, expiry: "2024-01-19" });
    expect(parseOccSymbol("BRK.B250117C00450500")).toMatchObject({ symbol: "BRK.B", strike: 450.5 });
    expect(parseOccSymbol("TSLA1231222C00200000")).toMatchObject({ symbol: "TSLA1", strike: 200 });
  });

  it("rejects malformed symbols", () => {
    expect(parseOccSymbol("")).toBeNull();
    expect(parseOccSymbol("MSFT231222X00375000")).toBeNull();
    expect(parseOccSymbol("MSFT231322C00375000")).toBeNull();
    expect(parseOccSymbol("MSFT231222C0037500")).toBeNull();
  });
});

describe("util", () => {
  it("num parses strings and tolerates garbage", () => {
    expect(num("186705")).toBe(186705);
    expect(num("4.05")).toBe(4.05);
    expect(num(12)).toBe(12);
    expect(num(null)).toBe(0);
    expect(num("abc")).toBe(0);
    expect(num("")).toBe(0);
    expect(numOpt("")).toBeUndefined();
    expect(numOpt(undefined)).toBeUndefined();
    expect(numOpt("1e3")).toBe(1000);
  });

  it("etTradeDate converts UTC timestamps to the New York calendar date", () => {
    expect(etTradeDate("2026-10-21T23:30:00Z")).toBe("2026-10-21");
    expect(etTradeDate("2026-10-22T03:59:00Z")).toBe("2026-10-21");
    expect(etTradeDate("2026-10-22T04:01:00Z")).toBe("2026-10-22");
    expect(etTradeDate("2026-01-15T04:30:00Z")).toBe("2026-01-14"); // EST offset
    expect(etTradeDate("2023-12-12T16:35:52.168490Z")).toBe("2023-12-12");
    expect(etTradeDate("not a date")).toBe("not a date");
  });

  it("stableHash and slugify are deterministic", () => {
    expect(stableHash("a|b")).toBe(stableHash("a|b"));
    expect(stableHash("a|b")).not.toBe(stableHash("a|c"));
    expect(stableHash("x")).toMatch(/^[0-9a-f]{16}$/);
    expect(slugify("PDUFA Date: Zepbound (tirzepatide)!")).toBe("pdufa-date-zepbound-tirzepatide");
    expect(slugify("")).toBe("x");
  });
});

describe("TokenBucket", () => {
  it("serves a full bucket immediately and then waits for refill", async () => {
    let t = 0;
    const sleeps: number[] = [];
    const bucket = new TokenBucket(3, { now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } });
    await Promise.all([bucket.acquire(), bucket.acquire(), bucket.acquire()]);
    expect(sleeps).toEqual([]);
    await bucket.acquire();
    expect(sleeps.reduce((a, b) => a + b, 0)).toBe(20_000);
  });

  it("honours an external pause", async () => {
    let t = 0;
    const sleeps: number[] = [];
    const bucket = new TokenBucket(120, { now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } });
    bucket.pauseFor(2500);
    await bucket.acquire();
    expect(sleeps).toEqual([2500]);
  });

  it("drains every waiter at the deadline instead of one per token", async () => {
    let t = 0;
    const sleeps: number[] = [];
    // 60/min = one token per second; the bucket starts with 60.
    const bucket = new TokenBucket(60, { now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } });
    const got = await Promise.all(Array.from({ length: 100 }, () => bucket.acquire(5_000)));
    expect(got.filter(Boolean)).toHaveLength(65);
    expect(got.slice(65).every((g) => g === false)).toBe(true);
    // No sleep runs past the deadline (+1ms to cross it).
    expect(t).toBe(5_001);
  });
});

describe("expiry helpers", () => {
  it("thirdFriday", () => {
    expect(thirdFriday(2026, 10)).toBe("2026-10-16");
    expect(thirdFriday(2026, 11)).toBe("2026-11-20");
    expect(thirdFriday(2025, 4)).toBe("2025-04-18");
  });

  it("nextMonthlyExpiry rolls forward and avoids holidays", () => {
    expect(nextMonthlyExpiry("2026-10-16")).toBe("2026-10-16");
    expect(nextMonthlyExpiry("2026-10-17")).toBe("2026-11-20");
    expect(nextMonthlyExpiry("2025-04-01")).toBe("2025-04-17"); // Good Friday 2025
    expect(nextMonthlyExpiry("2026-12-19")).toBe("2027-01-15");
  });
});

describe("volumePercentile", () => {
  const history: DailyOptionVolume[] = [];
  const start = new Date(Date.UTC(2026, 0, 1));
  for (let i = 0; i < 200; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    const total = 1000 + i; // monotonically increasing
    history.push({ date: d.toISOString().slice(0, 10), callVolume: total / 2, putVolume: total / 2, totalVolume: total });
  }

  it("ranks a day against the trailing 90 samples", () => {
    expect(volumePercentile(history, history[150].date)).toBe(100);
    const flat = history.map((h) => ({ ...h, totalVolume: 500 }));
    expect(volumePercentile(flat, flat[150].date)).toBe(0);
  });

  it("uses only samples strictly before the date, capped at the lookback", () => {
    const spiky = history.map((h, i) => ({ ...h, totalVolume: i === 100 ? 1 : 1000 }));
    expect(volumePercentile(spiky, spiky[100].date)).toBe(0);
    expect(volumePercentile(spiky, spiky[101].date)).toBeCloseTo(1.1, 1); // 1 of 90 below
    expect(volumePercentile(spiky, spiky[191].date)).toBe(0); // the spike has fallen out of the window
  });

  it("returns null below 30 samples or for unknown dates", () => {
    expect(volumePercentile(history, history[10].date)).toBeNull();
    expect(volumePercentile(history, history[29].date)).toBeNull();
    expect(volumePercentile(history, history[30].date)).not.toBeNull();
    expect(volumePercentile(history, "1999-01-01")).toBeNull();
    expect(volumePercentile([], "2026-01-01")).toBeNull();
  });

  it("is order-independent", () => {
    const shuffled = [...history].reverse();
    expect(volumePercentile(shuffled, history[150].date)).toBe(100);
  });
});
