import { describe, expect, it } from "vitest";
import { caseSummary, headlineFinding } from "@/lib/plain";
import type { EventSummary } from "@/lib/data";

const summary = (over: Partial<EventSummary>): EventSummary =>
  ({
    catalyst: { ticker: "MRK", eventDate: "2026-10-29", kind: "earnings", session: "premarket", title: "Earnings (pre-market)" },
    partialWindow: true,
    score: 50,
    direction: "bearish",
    verdict: "pending",
    realizedMovePct: null,
    impliedMovePct: 5,
    ...over,
  }) as unknown as EventSummary;

describe("caseSummary", () => {
  it("says there were no large trades instead of $0, and where the lean came from", () => {
    const text = caseSummary(summary({ partialWindow: false }), { premium: 0, callShare: 0, timesNormal: null });
    expect(text).toContain("made no large options trades");
    expect(text).not.toContain("$0");
    expect(text).toContain("lean toward a fall comes only from new open contracts and option prices");
  });

  it("names the overall lean when the money is split between calls and puts", () => {
    const text = caseSummary(summary({}), { premium: 3_100_000, callShare: 0.5, timesNormal: 4 });
    expect(text).toContain("split between calls");
    expect(text).toContain("lean toward a fall");
  });

  it("says nothing extra when the split has no lean", () => {
    const text = caseSummary(summary({ direction: "mixed" }), { premium: 3_100_000, callShare: 0.5, timesNormal: 4 });
    expect(text).not.toContain("lean toward");
  });

  it("calls a smaller move in the bets' direction 'right way' rather than wrong", () => {
    const text = caseSummary(
      summary({ partialWindow: false, verdict: "missed", direction: "bullish", realizedMovePct: 2.8, impliedMovePct: 7 }),
      { premium: 975_000, callShare: 0.8, timesNormal: 22 },
    );
    expect(text).toContain("the way the bets leaned, but less than expected");
  });
});

describe("fallbackDossierSummary", () => {
  it("doesn't call a right-way, smaller-than-expected move wrong", async () => {
    const { fallbackDossierSummary } = await import("@foreshadow/narrator");
    const text = fallbackDossierSummary({
      ticker: "FERG",
      events: [
        { eventDate: "2026-08-10", kind: "earnings", title: "Earnings (pre-market)", score: 70.5, direction: "bullish", verdict: "missed", realizedMovePct: 2.8, outcome: "right way, small move" },
      ],
      hitRate: { scored: 1, strong: 1, matched: 0 },
    });
    expect(text).toContain("the way the bets leaned but less than expected");
    expect(text).not.toContain("the bets were wrong");
  });
});

describe("caseSummary for FDA news", () => {
  it("puts the FDA headline in brackets instead of after a possessive", () => {
    const text = caseSummary(
      summary({
        catalyst: { ticker: "TENX", eventDate: "2026-08-10", kind: "fda", session: "premarket", title: "Top-line results: TNX-103" } as EventSummary["catalyst"],
        partialWindow: false,
        verdict: "matched",
        direction: "bearish",
        realizedMovePct: -89.8,
        impliedMovePct: 81,
      }),
      { premium: 3_200_000, callShare: 0.2, timesNormal: 9 },
    );
    expect(text).toContain("before TENX's news on Aug 10 (Top-line results: TNX-103)");
  });
});

describe("headlineFinding", () => {
  const band = (min: number, max: number, cases: number, movedMore: number) => ({ min, max, label: `${min}`, cases, right: 0, movedMore, leaned: 0, leanedRight: 0 });
  it("names the kind where unusual betting clearly came before bigger moves", () => {
    const f = headlineFinding([
      { kind: "earnings", bands: [band(0, 19, 692, 208), band(20, 39, 316, 98), band(40, 69, 47, 15), band(70, 100, 1, 0)] },
      { kind: "fda", bands: [band(0, 19, 400, 56), band(20, 39, 150, 30), band(40, 69, 30, 8), band(70, 100, 0, 0)] },
    ]);
    expect(f).toMatchObject({ kind: "fda", noun: "FDA news", unusualPct: 27, ordinaryPct: 14, unusualCases: 30 });
  });
  it("claims nothing when no kind clears the test", () => {
    expect(headlineFinding([{ kind: "earnings", bands: [band(0, 19, 692, 208), band(40, 69, 47, 15)] }])).toBeNull();
  });
});
