/**
 * Historic-lookback cut-off discovery.
 *
 * UW rejects any request whose date predates the plan's lookback with
 * 403 `historic_data_access_missing`, and the 403 body does not say where the
 * cut-off is. Accessibility is monotone in time, so a binary search over the
 * ascending requested dates finds the first accessible index in O(log n)
 * probes instead of failing one request per inaccessible day.
 */

import type { IsoDate } from "../../core/src/types";
import { isHistoricAccessError } from "./errors";

/**
 * Find the first accessible index in `[0, n)`.
 *
 * `probe(lo, hi)` must fetch (and keep) the data for index range `[lo, hi)`
 * and throw on failure; only a lookback 403 is treated as "inaccessible",
 * every other error propagates. Per-date callers may probe only `lo`.
 * Returns `n` when nothing is accessible.
 */
export async function findFirstAccessible(
  n: number,
  probe: (lo: number, hi: number) => Promise<void>,
): Promise<number> {
  if (n <= 0) return 0;
  try {
    await probe(0, n);
    return 0;
  } catch (err) {
    if (!isHistoricAccessError(err)) throw err;
  }
  let bad = 0;
  let good = n;
  while (good - bad > 1) {
    const mid = (bad + good) >> 1;
    try {
      await probe(mid, good);
      good = mid;
    } catch (err) {
      if (!isHistoricAccessError(err)) throw err;
      bad = mid;
    }
  }
  return good;
}

/** Human-readable warning for the dates before the discovered cut-off. */
export function historicWarning(endpoint: string, ticker: string, dates: IsoDate[], firstOk: number): string {
  const blocked = dates.slice(0, firstOk);
  const first = blocked[0];
  const last = blocked[blocked.length - 1];
  const span = first === last ? first : `${first}..${last}`;
  const earliest = firstOk < dates.length ? ` earliest accessible ${dates[firstOk]};` : "";
  return `${endpoint}: ${ticker} ${span} outside the UW plan lookback (historic_data_access_missing);${earliest} returned empty`;
}
