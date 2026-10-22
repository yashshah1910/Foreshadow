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
