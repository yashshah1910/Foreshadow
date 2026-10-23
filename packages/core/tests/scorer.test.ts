import { describe, expect, it } from "vitest";
import { WEIGHTS, agreeWithMoney, betsOf, clipZ, scoreBand, scoreEvent, zScore } from "../src/scorer";
import { bearishSpikeInput, bullishSpikeInput, quietInput } from "./helpers";

describe("scorer primitives", () => {
  it("weights sum to 1", () => {
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("clips z to [0, 4] and scales to [0, 1]", () => {
    expect(clipZ(-3)).toBe(0);
    expect(clipZ(0)).toBe(0);
    expect(clipZ(2)).toBe(0.5);
    expect(clipZ(4)).toBe(1);
    expect(clipZ(40)).toBe(1);
    expect(clipZ(Number.NaN)).toBe(0);
  });

  it("z-score uses the sample standard deviation and a floor", () => {
    const r = zScore(10, [2, 4, 4, 4, 5, 5, 7, 9]);
    expect(r.mean).toBe(5);
    expect(r.sd).toBeCloseTo(2.138, 3);
    expect(r.z).toBeCloseTo(2.3385, 3);
    expect(zScore(5, [1]).z).toBe(0);
    expect(zScore(5, [3, 3, 3], 1).z).toBe(2);
  });

  it("bands", () => {
    expect(scoreBand(12)).toBe("quiet");
    expect(scoreBand(40)).toBe("notable");
    expect(scoreBand(69.9)).toBe("notable");
    expect(scoreBand(70)).toBe("someone-knew");
  });
});

describe("scoreEvent", () => {
  it("is deterministic", () => {
    const a = scoreEvent(bearishSpikeInput("ACME", "2026-10-22"));
    const b = scoreEvent(bearishSpikeInput("ACME", "2026-10-22"));
    expect(a).toEqual(b);
  });

  it("a footprint that looks like the baseline scores quiet", () => {
    const r = scoreEvent(quietInput("ACME", "2026-10-22"));
    expect(r.score).toBeLessThan(40);
    expect(r.flags.insufficientHistory).toBe(false);
    expect(r.flags.footprintDaysUsed).toBe(5);
  });

  it("a bearish put spike scores 70+ and reads bearish", () => {
    const r = scoreEvent(bearishSpikeInput("ACME", "2026-10-22"));
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.direction).toBe("bearish");
    expect(r.directionScore).toBeLessThan(0);
    expect(r.topAlerts).toHaveLength(5);
    expect(r.topAlerts.every((a) => a.type === "put" || a.type === "call")).toBe(true);
    // top alerts are sorted by premium, largest first
    for (let i = 1; i < r.topAlerts.length; i++) {
      expect(r.topAlerts[i - 1].premium).toBeGreaterThanOrEqual(r.topAlerts[i].premium);
    }
  });

  it("keeps no Unusual Whales ids or raw fields on the top trades", () => {
    const r = scoreEvent(bearishSpikeInput("ACME", "2026-10-22"));
    for (const a of r.topAlerts) expect(Object.keys(a).sort()).toEqual(["expiry", "isSweep", "premium", "side", "strike", "tradeDate", "type"]);
  });

  it("a bullish call spike reads bullish", () => {
    const r = scoreEvent(bullishSpikeInput("ACME", "2026-10-22"));
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.direction).toBe("bullish");
  });

  it("no signal can contribute more than its weight", () => {
    const r = scoreEvent(bearishSpikeInput("ACME", "2026-10-22"));
    for (const s of r.signals) {
      expect(s.contribution).toBeLessThanOrEqual(s.weight * 100 + 1e-9);
      expect(s.contribution).toBeGreaterThanOrEqual(0);
    }
    const sum = r.signals.reduce((a, s) => a + s.contribution, 0);
    expect(Math.abs(sum - r.score)).toBeLessThan(0.15);
  });

  it("volume unusualness maps the percentile straight onto its weight", () => {
    const input = quietInput("ACME", "2026-10-22");
    for (const d of input.footprintDays) d.volumePercentile = 100;
    const r = scoreEvent(input);
    const vol = r.signals.find((s) => s.key === "volumeUnusualness")!;
    expect(vol.contribution).toBe(15);
    for (const d of input.footprintDays) d.volumePercentile = 50;
    const half = scoreEvent(input).signals.find((s) => s.key === "volumeUnusualness")!;
    expect(half.contribution).toBe(7.5);
  });

  it("flags insufficient history, ETFs, partial windows and multi-catalyst tickers", () => {
    const input = bearishSpikeInput("SPY", "2026-10-22");
    input.baselineDays = input.baselineDays.slice(-10);
    const r = scoreEvent({ ...input, partialWindow: true, otherCatalystsInWindow: 1 });
    expect(r.flags.insufficientHistory).toBe(true);
    expect(r.flags.baselineDaysWithActivity).toBe(10);
    expect(r.flags.isIndexOrEtf).toBe(true);
    expect(r.flags.partialWindow).toBe(true);
    expect(r.flags.multiCatalyst).toBe(true);
  });

  it("an empty footprint scores zero without throwing", () => {
    const input = quietInput("ACME", "2026-10-22");
    const r = scoreEvent({ ...input, footprintDays: [] });
    expect(r.score).toBe(0);
    expect(r.direction).toBe("mixed");
    expect(r.topAlerts).toEqual([]);
  });

  it("an empty baseline yields no z evidence", () => {
    const input = bearishSpikeInput("ACME", "2026-10-22");
    const r = scoreEvent({ ...input, baselineDays: [] });
    // only the percentile signal survives (it needs no baseline)
    const vol = r.signals.find((s) => s.key === "volumeUnusualness")!;
    expect(r.score).toBeCloseTo(vol.contribution, 1);
    expect(r.flags.insufficientHistory).toBe(true);
  });

  it("pins the reference fixture score (regression)", () => {
    const r = scoreEvent(bearishSpikeInput("ACME", "2026-10-22"));
    expect(r.score).toMatchInlineSnapshot(`91.9`);
    expect(r.signals.map((s) => [s.key, s.contribution])).toMatchInlineSnapshot(`
      [
        [
          "flowIntensity",
          25,
        ],
        [
          "directionalPremium",
          20,
        ],
        [
          "openInterest",
          20,
        ],
        [
          "volumeUnusualness",
          14.4,
        ],
        [
          "skewShift",
          10,
        ],
        [
          "darkPool",
          2.45,
        ],
      ]
    `);
  });
});

describe("agreeWithMoney", () => {
  it("turns a lean that contradicts the money into mixed", () => {
    expect(agreeWithMoney("bearish", 5_400_000, 1_400_000)).toBe("mixed");
    expect(agreeWithMoney("bullish", 1_000_000, 3_000_000)).toBe("mixed");
  });

  it("keeps a lean the money supports or doesn't contradict", () => {
    expect(agreeWithMoney("bearish", 1_000_000, 3_000_000)).toBe("bearish");
    expect(agreeWithMoney("bullish", 1_600_000, 1_540_000)).toBe("bullish");
    expect(agreeWithMoney("bearish", 1_600_000, 1_540_000)).toBe("bearish");
    expect(agreeWithMoney("bullish", 0, 0)).toBe("bullish");
    expect(agreeWithMoney("mixed", 5, 1)).toBe("mixed");
  });

  it("counts only calls and puts bought at the asking price as bets", () => {
    const r = scoreEvent(bearishSpikeInput("ACME", "2026-10-22"));
    const d = r.signals.find((s) => s.key === "directionalPremium")!.detail;
    expect(d.boughtCallPremium + d.boughtPutPremium).toBeLessThanOrEqual(d.callPremium + d.putPremium);
    for (const m of r.daily) {
      expect(m.boughtCallPremium).toBeLessThanOrEqual(m.callPremium);
      expect(m.boughtPutPremium).toBeLessThanOrEqual(m.putPremium);
    }
    expect(betsOf({ callPremium: 10, putPremium: 8, boughtCallPremium: 6, boughtPutPremium: 1 })).toEqual({ rise: 6, fall: 1 });
    // Rows stored before the split fall back to every call and put.
    expect(betsOf({ callPremium: 10, putPremium: 8 })).toEqual({ rise: 10, fall: 8 });
  });

  it("turns a lean into mixed when premium, net ask-side premium and open interest all favour the other side", () => {
    // TSLA before Oct 21, 2026: calls $367M vs puts $290M, +$2.9M a day net to calls, call open interest building.
    expect(agreeWithMoney("bearish", 367e6, 290e6, 2.9e6, 0.2)).toBe("mixed");
    expect(agreeWithMoney("bullish", 290e6, 367e6, -2.9e6, -0.2)).toBe("mixed");
    // One of the three on the lean's side keeps it.
    expect(agreeWithMoney("bearish", 367e6, 290e6, 2.9e6, -0.2)).toBe("bearish");
    expect(agreeWithMoney("bearish", 367e6, 290e6, -1e6, 0.2)).toBe("bearish");
  });
});
