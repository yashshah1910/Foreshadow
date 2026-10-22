import { describe, expect, it } from "vitest";
import { caseSummary } from "@/lib/plain";
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
