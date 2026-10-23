import { describe, expect, it } from "vitest";
import type { EventSummary } from "@/lib/data";
import { similarCases } from "@/lib/similar";

let n = 0;
const s = (score: number, over: Partial<EventSummary> & { kind?: string } = {}): EventSummary => {
  const { kind = "fda", ...rest } = over;
  n += 1;
  return {
    catalyst: { id: `c${n}`, kind, ticker: "X", eventDate: "2026-09-01", title: "t", session: "premarket" },
    score,
    direction: "bearish",
    verdict: "missed",
    partialWindow: false,
    flags: { isIndexOrEtf: false, insufficientHistory: false },
    ...rest,
  } as unknown as EventSummary;
};

describe("similarCases", () => {
  it("keeps same kind, same lean and a close score, closest first", () => {
    const target = s(50);
    const pool = [s(52, { verdict: "matched" }), s(45), s(80), s(51, { direction: "bullish" }), s(49, { kind: "earnings" }), s(57, { verdict: "matched" })];
    const r = similarCases(target, [target, ...pool], 2);
    expect(r.cases.map((c) => c.score)).toEqual([52, 45, 57]);
    expect(r.right).toBe(2);
    expect([r.lo, r.hi]).toEqual([42, 58]);
  });

  it("counts cases that moved the way the bets leaned, whatever the size", () => {
    const target = s(50);
    const pool = [s(51, { realizedMovePct: -2 }), s(52, { realizedMovePct: 3 }), s(49, { realizedMovePct: -9, verdict: "matched" })];
    const r = similarCases(target, pool, 3);
    expect(r.right).toBe(1);
    expect(r.wentTheirWay).toBe(2);
  });

  it("widens the range to find enough cases, but not past 32 points", () => {
    const target = s(50);
    const r = similarCases(target, [s(75), s(20), s(10)], 2);
    expect(r.cases.map((c) => c.score)).toEqual([75, 20]);
    expect([r.lo, r.hi]).toEqual([18, 82]);
  });

  it("skips unfinished cases", () => {
    const r = similarCases(s(30), [s(31, { verdict: "pending" }), s(29, { partialWindow: true })]);
    expect(r.cases).toHaveLength(0);
  });
  it("counts moves past the expected move and gives the typical actual and expected move", () => {
    const target = s(50);
    const pool = [
      s(50, { realizedMovePct: -12, impliedMovePct: 8 }),
      s(51, { realizedMovePct: 3, impliedMovePct: 6 }),
      s(49, { realizedMovePct: -9, impliedMovePct: 10 }),
    ];
    const r = similarCases(target, [target, ...pool], 3);
    expect(r.movedMore).toBe(1);
    expect(r.typicalMovePct).toBe(9);
    expect(r.typicalExpectedPct).toBe(8);
  });
});
