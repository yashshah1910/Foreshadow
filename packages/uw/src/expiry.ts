/**
 * Standard monthly option expiries (third Friday of the month).
 */

import type { IsoDate } from "../../core/src/types";
import { addCalendarDays, isTradingDay, parseIso, previousTradingDay, toIso } from "../../core/src/windows";

/**
 * Third Friday of `month` (1-12) in `year`, as an ISO date. This is the
 * nominal monthly expiry; see `nextMonthlyExpiry` for the holiday-adjusted one.
 */
export function thirdFriday(year: number, month: number): IsoDate {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstDow = first.getUTCDay(); // 0 = Sunday
  const offsetToFriday = (5 - firstDow + 7) % 7;
  return toIso(new Date(Date.UTC(year, month - 1, 1 + offsetToFriday + 14)));
}

/**
 * First standard monthly expiry on or after `date`. When the third Friday is
 * an exchange holiday (e.g. Good Friday) the contract expires the day before.
 */
export function nextMonthlyExpiry(date: IsoDate): IsoDate {
  const d = parseIso(date);
  let year = d.getUTCFullYear();
  let month = d.getUTCMonth() + 1;
  for (let i = 0; i < 24; i++) {
    const nominal = thirdFriday(year, month);
    const expiry = isTradingDay(nominal) ? nominal : previousTradingDay(nominal);
    if (expiry >= date) return expiry;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return addCalendarDays(date, 30);
}
