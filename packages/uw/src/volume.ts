/**
 * Option-volume unusualness for past dates.
 *
 * UW's `/api/stock/{ticker}/unusualness` only describes the latest trading
 * day. For historical scoring we rebuild the same statistic from the daily
 * `/options-volume` history: the percentile rank of a day's total option
 * volume among the trailing 90 trading days before it.
 */

import type { IsoDate } from "../../core/src/types";
import type { DailyOptionVolume } from "./types";

/** Trailing window UW uses for its own unusualness metric. */
export const VOLUME_LOOKBACK_DAYS = 90;
/** Below this many trailing samples the percentile is undefined (UW returns null too). */
export const VOLUME_MIN_SAMPLES = 30;

/**
 * Percentile rank (0-100, one decimal) of `date`'s total option volume among
 * the `lookback` (default 90) history rows strictly before it. Rank is the
 * share of trailing samples strictly below that day's volume, so the busiest
 * day of the window scores 100 and the quietest 0. Returns `null` when `date`
 * is not in `history` or fewer than `minSamples` (default 30) trailing rows
 * exist. `history` may be in any order.
 */
export function volumePercentile(
  history: DailyOptionVolume[],
  date: IsoDate,
  opts: { lookback?: number; minSamples?: number } = {},
): number | null {
  const lookback = opts.lookback ?? VOLUME_LOOKBACK_DAYS;
  const minSamples = opts.minSamples ?? VOLUME_MIN_SAMPLES;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const index = sorted.findIndex((row) => row.date === date);
  if (index < 0) return null;
  const trailing = sorted.slice(Math.max(0, index - lookback), index);
  if (trailing.length < minSamples) return null;
  const today = sorted[index].totalVolume;
  let below = 0;
  for (const row of trailing) if (row.totalVolume < today) below += 1;
  return Math.round((below / trailing.length) * 1000) / 10;
}
