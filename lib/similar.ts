import type { EventSummary } from "@/lib/data";
import { leaderboardEligible } from "@/lib/data/shared";

export interface Similar {
  /** Finished cases like this one, closest score first. */
  cases: EventSummary[];
  right: number;
  /** Cases where the stock at least moved the way the bets leaned, whatever the size of the move. */
  wentTheirWay: number;
  /** Score range used, after widening if needed to find enough cases. */
  lo: number;
  hi: number;
}

/**
 * Past cases of the same kind of news, with a similar score and the same
 * lean, so a reader can see how betting like this has turned out before.
 * Widens the score range until it finds at least `want` cases.
 */
export function similarCases(target: EventSummary, pool: EventSummary[], want = 5): Similar {
  const candidates = pool.filter(
    (s) =>
      s.catalyst.id !== target.catalyst.id &&
      s.catalyst.kind === target.catalyst.kind &&
      leaderboardEligible(s) &&
      (target.direction === "mixed" || s.direction === target.direction),
  );
  let width = 8;
  let picked: EventSummary[] = [];
  for (; width <= 32; width += 8) {
    picked = candidates.filter((s) => Math.abs(s.score - target.score) <= width);
    if (picked.length >= want) break;
  }
  width = Math.min(width, 32);
  picked.sort((a, b) => Math.abs(a.score - target.score) - Math.abs(b.score - target.score));
  return {
    cases: picked,
    right: picked.filter((s) => s.verdict === "matched").length,
    wentTheirWay: picked.filter((s) => s.direction !== "mixed" && s.realizedMovePct !== null && s.realizedMovePct !== 0 && (s.direction === "bullish") === s.realizedMovePct > 0).length,
    lo: Math.max(0, Math.round(target.score - width)),
    hi: Math.min(100, Math.round(target.score + width)),
  };
}
