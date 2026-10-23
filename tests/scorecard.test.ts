import { describe, expect, it } from "vitest";
import { buildScorecard } from "@/lib/data/shared";
import type { ScorecardCase } from "@/lib/data/types";

const c = (over: Partial<ScorecardCase>): ScorecardCase => ({
  kind: "fda",
  score: 10,
  direction: "bullish",
  verdict: "missed",
  realizedMovePct: 1,
  impliedMovePct: 5,
  ...over,
});

describe("buildScorecard", () => {
  it("counts right bets, big moves and lean direction per kind and band", () => {
    const card = buildScorecard([
      c({ score: 45, verdict: "matched", realizedMovePct: 12, impliedMovePct: 8 }),
      c({ score: 50, verdict: "missed", direction: "bearish", realizedMovePct: 3, impliedMovePct: 8 }),
      c({ score: 5 }),
      c({ kind: "earnings", score: 72, verdict: "matched", realizedMovePct: -9, impliedMovePct: 4, direction: "bearish" }),
    ]);
    expect(card.cases).toBe(4);
    const fda = card.kinds.find((k) => k.kind === "fda")!;
    const unusual = fda.bands.find((b) => b.min === 40)!;
    expect(unusual).toMatchObject({ cases: 2, right: 1, movedMore: 1, leaned: 2, leanedRight: 1 });
    expect(fda.bands.find((b) => b.min === 0)!.cases).toBe(1);
    const earnings = card.kinds.find((k) => k.kind === "earnings")!;
    expect(earnings.bands.find((b) => b.min === 70)!).toMatchObject({ cases: 1, right: 1, leanedRight: 1 });
  });

  it("ignores unfinished cases and mixed leans in the direction count", () => {
    const card = buildScorecard([c({ verdict: "pending" }), c({ verdict: "insufficient" }), c({ direction: "mixed", score: 30 })]);
    expect(card.cases).toBe(1);
    expect(card.kinds[0].bands.find((b) => b.min === 20)!).toMatchObject({ cases: 1, leaned: 0 });
  });

  it("rounds scores into bands the way the site shows them", () => {
    const card = buildScorecard([c({ score: 39.6 })]);
    expect(card.kinds[0].bands.find((b) => b.min === 40)!.cases).toBe(1);
  });
});

describe("scorecardFinding", () => {
  // `cases` here are cases where the bets leaned (the rate's denominator); a few extra unleaned ones are added to show they don't count.
  const band = (min: number, cases: number, right: number) => ({ min, max: min + 19, label: "", cases: cases + 3, right, movedMore: 0, leaned: cases, leanedRight: right });

  it("reports a lift with its size and flags a small sample", async () => {
    const { scorecardFinding } = await import("@/lib/plain");
    const s = scorecardFinding("fda", [band(0, 219, 12), band(20, 92, 5), band(40, 18, 5), band(70, 0, 0)]);
    expect(s).toBe(
      "Before FDA news, when the betting leaned one way, unusual betting was right 28% of the time (5 of 18), about 5 times as often as ordinary betting (5%). That's only 18 cases, so treat it as early.",
    );
  });

  it("says plainly when there is no edge", async () => {
    const { scorecardFinding } = await import("@/lib/plain");
    expect(scorecardFinding("earnings", [band(0, 233, 17), band(20, 127, 14), band(40, 24, 2), band(70, 0, 0)])).toBe(
      "Before earnings, unusual betting hasn't clearly beaten ordinary betting so far: 8% right against 7%, counting cases where the bets leaned.",
    );
  });

  it("doesn't call a small lift a win", async () => {
    const { scorecardFinding } = await import("@/lib/plain");
    expect(scorecardFinding("earnings", [band(0, 236, 18), band(40, 25, 3)])).toContain("hasn't clearly beaten");
  });

  it("doesn't print an absurd ratio when ordinary betting was never right", async () => {
    const { scorecardFinding } = await import("@/lib/plain");
    const s = scorecardFinding("earnings", [band(0, 40, 0), band(40, 14, 10)]);
    expect(s).toContain("far more often than ordinary betting (0%)");
    expect(s).not.toMatch(/\d{3,} times/);
  });

  it("rounds the ratio to a half", async () => {
    const { scorecardFinding } = await import("@/lib/plain");
    // The live FDA numbers on Oct 23, 2026: 6 of 24 against 21 of 297.
    expect(scorecardFinding("fda", [band(0, 297, 21), band(40, 24, 6)])).toContain("right 25% of the time (6 of 24), about 3.5 times as often as ordinary betting (7%)");
  });

  it("refuses to judge tiny samples", async () => {
    const { scorecardFinding } = await import("@/lib/plain");
    expect(scorecardFinding("fda", [band(0, 50, 3), band(40, 2, 1)])).toContain("Too few to judge");
  });
});

describe("outcomeOf", () => {
  it("splits a miss into right way and wrong way", async () => {
    const { outcomeOf } = await import("@/lib/plain");
    expect(outcomeOf({ verdict: "matched", direction: "bearish", realizedMovePct: -12 })).toBe("right");
    expect(outcomeOf({ verdict: "missed", direction: "bullish", realizedMovePct: 1 })).toBe("rightWay");
    expect(outcomeOf({ verdict: "missed", direction: "bearish", realizedMovePct: -0.3 })).toBe("rightWay");
    expect(outcomeOf({ verdict: "missed", direction: "bullish", realizedMovePct: -5.7 })).toBe("wrongWay");
    expect(outcomeOf({ verdict: "missed", direction: "mixed", realizedMovePct: 3 })).toBe("noLean");
    expect(outcomeOf({ verdict: "pending", direction: "bullish", realizedMovePct: null })).toBe("pending");
    expect(outcomeOf({ verdict: "missed", direction: "bullish", realizedMovePct: null })).toBe("none");
  });
});
