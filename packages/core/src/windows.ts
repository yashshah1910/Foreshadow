/**
 * Trading-day calendar and window helpers.
 *
 * Footprint window  = T-5 .. T-1   (five trading days before the event)
 * Baseline window   = T-65 .. T-6  (sixty trading days before that)
 *
 * Dates are ISO `YYYY-MM-DD` strings interpreted as exchange-local trading
 * days. All arithmetic is done in UTC so the host timezone never leaks in.
 */

import type { IsoDate } from "./types";

export const FOOTPRINT_DAYS = 5;
export const BASELINE_DAYS = 60;

/** NYSE full-day closures. Extend when a new year's calendar is published. */
const NYSE_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2024
  "2024-01-01", "2024-01-15", "2024-02-19", "2024-03-29", "2024-05-27",
  "2024-06-19", "2024-07-04", "2024-09-02", "2024-11-28", "2024-12-25",
  // 2025
  "2025-01-01", "2025-01-09", "2025-01-20", "2025-02-17", "2025-04-18",
  "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27",
  "2025-12-25",
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIso(date: IsoDate): Date {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Invalid ISO date: ${date}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function toIso(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function todayIso(now: Date = new Date()): IsoDate {
  return toIso(now);
}

export function isWeekend(date: IsoDate): boolean {
  const day = parseIso(date).getUTCDay();
  return day === 0 || day === 6;
}

export function isTradingDay(date: IsoDate): boolean {
  return !isWeekend(date) && !NYSE_HOLIDAYS.has(date);
}

export function addCalendarDays(date: IsoDate, n: number): IsoDate {
  const d = parseIso(date);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

/**
 * Move `n` trading days from `date` (negative moves backwards). The start
 * date itself does not count. Passing 0 returns the date unchanged.
 */
export function addTradingDays(date: IsoDate, n: number): IsoDate {
  let cur = date;
  let remaining = Math.abs(n);
  const step = n < 0 ? -1 : 1;
  while (remaining > 0) {
    cur = addCalendarDays(cur, step);
    if (isTradingDay(cur)) remaining -= 1;
  }
  return cur;
}

/** The last trading day strictly before `date`. */
export function previousTradingDay(date: IsoDate): IsoDate {
  return addTradingDays(date, -1);
}

/** The first trading day strictly after `date`. */
export function nextTradingDay(date: IsoDate): IsoDate {
  return addTradingDays(date, 1);
}

/** `date` if it is a trading day, otherwise the next one. */
export function onOrAfterTradingDay(date: IsoDate): IsoDate {
  return isTradingDay(date) ? date : nextTradingDay(date);
}

/** Inclusive list of trading days from `start` to `end`, ascending. */
export function tradingDaysBetween(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  if (start > end) return out;
  let cur = isTradingDay(start) ? start : nextTradingDay(start);
  while (cur <= end) {
    out.push(cur);
    cur = nextTradingDay(cur);
  }
  return out;
}

/** T-5 .. T-1, ascending. */
export function footprintWindow(eventDate: IsoDate, days = FOOTPRINT_DAYS): IsoDate[] {
  const out: IsoDate[] = [];
  let cur = eventDate;
  for (let i = 0; i < days; i++) {
    cur = previousTradingDay(cur);
    out.unshift(cur);
  }
  return out;
}

/** T-65 .. T-6, ascending. */
export function baselineWindow(
  eventDate: IsoDate,
  days = BASELINE_DAYS,
  gap = FOOTPRINT_DAYS,
): IsoDate[] {
  const out: IsoDate[] = [];
  let cur = addTradingDays(eventDate, -gap);
  for (let i = 0; i < days; i++) {
    cur = previousTradingDay(cur);
    out.unshift(cur);
  }
  return out;
}

/**
 * Live Radar: the part of the footprint window that has already happened.
 * Returns the trading days in T-5..T-1 that are <= `today`.
 */
export function partialFootprintWindow(eventDate: IsoDate, today: IsoDate): IsoDate[] {
  return footprintWindow(eventDate).filter((d) => d <= today);
}

/** Trading days in (today, today + n] - the Radar horizon. */
export function upcomingTradingDays(today: IsoDate, n: number): IsoDate[] {
  const out: IsoDate[] = [];
  let cur = today;
  for (let i = 0; i < n; i++) {
    cur = nextTradingDay(cur);
    out.push(cur);
  }
  return out;
}

/** Chart window for the Event Card: T-10 .. T+3. */
export function chartWindow(eventDate: IsoDate): IsoDate[] {
  const start = addTradingDays(eventDate, -10);
  const end = addTradingDays(eventDate, 3);
  return tradingDaysBetween(start, end);
}
