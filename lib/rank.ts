/**
 * Where a score sits among finished cases of the same kind of news, so a
 * reader gets "busier than 97% of past earnings cases" instead of a bare 31.
 */

/** Share (0-100, whole number) of `sorted` (ascending) scores below `score`. */
export function percentBelow(score: number, sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < score) lo = mid + 1;
    else hi = mid;
  }
  return Math.floor((lo / sorted.length) * 100);
}

/** "top 3%" for scores in the top quarter, else null ("top 48%" tells the reader nothing). */
export function topShare(score: number, sorted: readonly number[]): string | null {
  if (sorted.length < 20) return null;
  const below = percentBelow(score, sorted);
  return below >= 75 ? `top ${Math.max(1, 100 - below)}%` : null;
}

/** "busier than 97% of 1,056 finished earnings cases" */
export function rankPhrase(score: number, sorted: readonly number[], kindNoun: string): string | null {
  if (sorted.length < 20) return null;
  return `busier than ${percentBelow(score, sorted)}% of ${sorted.length.toLocaleString("en-US")} finished ${kindNoun} cases`;
}

/** The same rank for one stock: "the busiest of TSLA's 9 finished cases", "busier than 6 of TSLA's 9". */
export function stockRankPhrase(score: number, others: readonly number[], ticker: string): string | null {
  const n = others.length;
  if (n < 3) return null;
  const below = others.filter((s) => s < score).length;
  if (below === n) return `the busiest of ${ticker}'s ${n} other finished cases`;
  if (below === 0) return `the quietest of ${ticker}'s ${n} other finished cases`;
  return `busier than ${below} of ${ticker}'s ${n} other finished cases`;
}
