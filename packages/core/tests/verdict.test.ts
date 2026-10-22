import { describe, expect, it } from "vitest";
import { computeVerdict, impliedMoveFromIv } from "../src/verdict";
import type { OhlcBar } from "../src/types";

function bars(closes: Record<string, number>): OhlcBar[] {
  return Object.entries(closes).map(([date, close]) => ({
    ticker: "ACME",
    date,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }));
}

describe("computeVerdict", () => {
  const ohlc = bars({
    "2026-10-21": 100,
    "2026-10-22": 81,
    "2026-10-23": 83,
  });

  it("matches a bearish footprint against a drop bigger than the implied move", () => {
    const v = computeVerdict({
      eventDate: "2026-10-22",
      session: "premarket",
      direction: "bearish",
      ohlc,
      impliedMovePct: 12,
      today: "2026-11-01",
    });
    expect(v.verdict).toBe("matched");
    expect(v.realizedMovePct).toBe(-19);
    expect(v.reactionWindow).toBe("T");
    expect(v.impliedSource).toBe("uw");
  });

  it("misses when the sign disagrees or the move is smaller than implied", () => {
    expect(
      computeVerdict({ eventDate: "2026-10-22", session: "premarket", direction: "bullish", ohlc, impliedMovePct: 12 })
        .verdict,
    ).toBe("missed");
    expect(
      computeVerdict({ eventDate: "2026-10-22", session: "premarket", direction: "bearish", ohlc, impliedMovePct: 25 })
        .verdict,
    ).toBe("missed");
    expect(
      computeVerdict({ eventDate: "2026-10-22", session: "premarket", direction: "mixed", ohlc, impliedMovePct: 5 })
        .verdict,
    ).toBe("missed");
  });

  it("after-hours events are judged on the next session", () => {
    const v = computeVerdict({
      eventDate: "2026-10-22",
      session: "afterhours",
      direction: "bullish",
      ohlc,
      impliedMovePct: 2,
      today: "2026-11-01",
    });
    expect(v.reactionWindow).toBe("T+1");
    expect(v.fromDate).toBe("2026-10-22");
    expect(v.toDate).toBe("2026-10-23");
    expect(v.realizedMovePct).toBeCloseTo(2.47, 2);
    expect(v.verdict).toBe("matched");
  });

  it("is pending until the reaction bar exists", () => {
    const v = computeVerdict({
      eventDate: "2026-10-30",
      session: "premarket",
      direction: "bearish",
      ohlc,
      today: "2026-10-22",
    });
    expect(v.verdict).toBe("pending");
    expect(v.realizedMovePct).toBeNull();
  });

  it("is insufficient when bars are missing for a past event", () => {
    const v = computeVerdict({
      eventDate: "2026-09-10",
      session: "premarket",
      direction: "bearish",
      ohlc,
      today: "2026-10-22",
    });
    expect(v.verdict).toBe("insufficient");
    expect(v.impliedSource).toBe("fallback");
    expect(v.impliedMovePct).toBe(4);
  });

  it("derives an implied move from IV", () => {
    // 80% IV, 7 days to expiry -> 0.8 * 0.8 * sqrt(7/365) * 100 ~= 8.86%
    expect(impliedMoveFromIv(0.8, 7)).toBeCloseTo(8.86, 1);
  });
});
