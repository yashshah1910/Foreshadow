/**
 * Footprint loader: turns cached/fetched UW rows into `DailyFootprint`s,
 * `ScoreInput`s and verdict inputs. Every endpoint is read from the cache
 * first and only the missing dates are fetched; empty days are cached too.
 *
 * Dates after `today` are never fetched (they return empty days) and rows for
 * `today` itself are fetched but not persisted, because UW's intraday answer
 * for the current session is still changing.
 */

import type {
  Catalyst,
  DailyFootprint,
  DarkPoolPrint,
  FlowAlert,
  IsoDate,
  OhlcBar,
  OiChange,
  ScoreInput,
} from "../../core/src/types";
import {
  addCalendarDays,
  addTradingDays,
  baselineWindow,
  chartWindow,
  footprintWindow,
  nextTradingDay,
  partialFootprintWindow,
  previousTradingDay,
  todayIso,
  tradingDaysBetween,
} from "../../core/src/windows";
import { findFirstAccessible, historicWarning } from "./access";
import type { CacheEndpoint, CacheEntry, FootprintCache } from "./cache";
import type { UwClient } from "./client";
import { UwAccessError, isHistoricAccessError } from "./errors";
import { nextMonthlyExpiry } from "./expiry";
import type { DailyOptionVolume, InterpolatedIvRow, SkewPoint } from "./types";
import { isDefined, numOpt } from "./util";
import { VOLUME_LOOKBACK_DAYS, volumePercentile } from "./volume";

/** The subset of `UwClient` the loader needs (stub it in tests). */
export type FootprintClient = Pick<
  UwClient,
  | "getFlowAlerts"
  | "getOiChange"
  | "getDarkPool"
  | "getOptionsVolumeHistory"
  | "getRiskReversalSkew"
  | "getOhlcDaily"
  | "getInterpolatedIv"
>;

export interface LoadFootprintOptions {
  /** Expiry for the skew series; defaults to the monthly expiry after the last date. */
  skewExpiry?: IsoDate;
  /** Dark pool prints below this notional are not requested (default $1M). */
  minDarkPoolNotional?: number;
  /** Optional `min_premium` for the flow-alerts request. */
  minFlowPremium?: number;
  /** Defaults to the current UTC date. */
  today?: IsoDate;
}

export interface FootprintLoadResult {
  days: DailyFootprint[];
  warnings: string[];
}

export interface ScoreInputResult {
  input: ScoreInput;
  warnings: string[];
}

export interface OutcomeResult {
  ohlc: OhlcBar[];
  impliedMovePct?: number;
  warnings: string[];
}

const MAX_OPTIONS_VOLUME_LIMIT = 500;

function entries<T>(ticker: string, endpoint: CacheEndpoint, rows: Map<IsoDate, T>, today: IsoDate): CacheEntry<T>[] {
  const out: CacheEntry<T>[] = [];
  for (const [tradeDate, payload] of rows) if (tradeDate < today) out.push({ ticker, tradeDate, endpoint, payload });
  return out;
}

/** Split ascending trading days into runs of consecutive trading days. */
function contiguousRuns(dates: IsoDate[]): IsoDate[][] {
  const runs: IsoDate[][] = [];
  for (const d of dates) {
    const last = runs[runs.length - 1];
    if (last && nextTradingDay(last[last.length - 1]) === d) last.push(d);
    else runs.push([d]);
  }
  return runs;
}

function accessWarning(endpoint: string, ticker: string, err: UwAccessError): string {
  return `${endpoint}: ${ticker} unavailable on this UW plan (${err.code ?? "forbidden"}); left empty`;
}

/**
 * Flow alerts for the missing dates, one `getFlowAlerts` range call per run
 * of consecutive missing trading days (`newer_than` = first day,
 * `older_than` = the day after the last). Alerts are bucketed by ET trade
 * date and every requested date is cached, empty or not.
 */
async function loadFlowAlerts(
  client: FootprintClient,
  cache: FootprintCache,
  ticker: string,
  dates: IsoDate[],
  today: IsoDate,
  minPremium: number | undefined,
  warnings: string[],
): Promise<Map<IsoDate, FlowAlert[]>> {
  const result = await cache.getMany<FlowAlert[]>(ticker, dates, "flow-alerts");
  const missing = dates.filter((d) => !result.has(d));
  await Promise.all(
    contiguousRuns(missing).map(async (run) => {
      const fetched = new Map<IsoDate, FlowAlert[]>();
      const firstOk = await findFirstAccessible(run.length, async (lo, hi) => {
        const slice = run.slice(lo, hi);
        const alerts = await client.getFlowAlerts({
          ticker,
          newerThan: slice[0],
          olderThan: addCalendarDays(slice[slice.length - 1], 1),
          minPremium,
        });
        for (const d of slice) fetched.set(d, []);
        for (const a of alerts) fetched.get(a.tradeDate)?.push(a);
      });
      if (firstOk > 0) warnings.push(historicWarning("flow-alerts", ticker, run, firstOk));
      await cache.setMany(entries(ticker, "flow-alerts", fetched, today));
      for (const [d, rows] of fetched) result.set(d, rows);
    }),
  );
  return result;
}

/** One call per missing date; probes the oldest date first to find the lookback cut-off. */
async function loadPerDate<T>(
  cache: FootprintCache,
  ticker: string,
  dates: IsoDate[],
  endpoint: CacheEndpoint,
  today: IsoDate,
  fetchOne: (date: IsoDate) => Promise<T[]>,
  warnings: string[],
): Promise<Map<IsoDate, T[]>> {
  const result = await cache.getMany<T[]>(ticker, dates, endpoint);
  const missing = dates.filter((d) => !result.has(d));
  if (missing.length === 0) return result;
  const fetched = new Map<IsoDate, T[]>();
  const firstOk = await findFirstAccessible(missing.length, async (lo) => {
    fetched.set(missing[lo], await fetchOne(missing[lo]));
  });
  if (firstOk > 0) warnings.push(historicWarning(endpoint, ticker, missing, firstOk));
  await Promise.all(
    missing
      .slice(firstOk)
      .filter((d) => !fetched.has(d))
      .map(async (d) => {
        try {
          fetched.set(d, await fetchOne(d));
        } catch (err) {
          if (!isHistoricAccessError(err)) throw err;
          warnings.push(historicWarning(endpoint, ticker, [d], 1));
        }
      }),
  );
  await cache.setMany(entries(ticker, endpoint, fetched, today));
  for (const [d, rows] of fetched) result.set(d, rows);
  return result;
}

/**
 * Daily option-volume history covering 90 trading days before the first
 * date. Cached under the last requested date; any cached copy keyed on or
 * after that date is reused when it spans the needed range. Rows for `today`
 * are kept in memory but never persisted.
 */
async function loadVolumeHistory(
  client: FootprintClient,
  cache: FootprintCache,
  ticker: string,
  dates: IsoDate[],
  today: IsoDate,
  warnings: string[],
): Promise<DailyOptionVolume[]> {
  const first = dates[0];
  const last = dates[dates.length - 1];
  const needFrom = addTradingDays(first, -VOLUME_LOOKBACK_DAYS);
  const keys = [...new Set([last, ...tradingDaysBetween(last, today)])];
  const cached = await cache.getMany<DailyOptionVolume[]>(ticker, keys, "options-volume");
  for (const rows of cached.values()) {
    if (rows.length > 0 && rows[0].date <= needFrom && rows[rows.length - 1].date >= last) return rows;
  }
  const limit = Math.min(MAX_OPTIONS_VOLUME_LIMIT, tradingDaysBetween(needFrom, today).length + 5);
  try {
    const rows = await client.getOptionsVolumeHistory(ticker, { limit });
    await cache.set(ticker, last, "options-volume", rows.filter((r) => r.date < today));
    return rows;
  } catch (err) {
    if (!(err instanceof UwAccessError)) throw err;
    warnings.push(accessWarning("options-volume", ticker, err));
    return [];
  }
}

/** 25-delta risk-reversal series for one expiry, cached under the expiry date. */
async function loadSkew(
  client: FootprintClient,
  cache: FootprintCache,
  ticker: string,
  dates: IsoDate[],
  expiry: IsoDate,
  today: IsoDate,
  warnings: string[],
): Promise<Map<IsoDate, number>> {
  const last = dates[dates.length - 1];
  const asOf = last < today ? last : today;
  let rows = await cache.get<SkewPoint[]>(ticker, expiry, "skew");
  if (!rows || rows.length === 0 || rows[rows.length - 1].date < asOf) {
    try {
      rows = await client.getRiskReversalSkew(ticker, { expiry, delta: "25", timeframe: "1Y", date: asOf });
      await cache.set(ticker, expiry, "skew", rows.filter((r) => r.date < today));
    } catch (err) {
      if (!(err instanceof UwAccessError)) throw err;
      warnings.push(accessWarning("skew", ticker, err));
      rows = [];
    }
  }
  return new Map(rows.map((r) => [r.date, r.skew]));
}

/**
 * One `DailyFootprint` per requested trading day (ascending), reading every
 * endpoint from `cache` first and fetching only the missing dates:
 * flow alerts per contiguous missing range, OI change and dark pool per
 * missing date, options-volume history and skew once per ticker. Dates
 * before the plan's lookback come back empty with a warning instead of
 * failing the load. Typical cost for a cold 65-day window: ~1-3 flow-alert
 * pages + 65 OI + 65 dark pool + 2 = ~135 requests; a warm cache costs 0.
 */
export async function loadDailyFootprints(
  client: FootprintClient,
  cache: FootprintCache,
  ticker: string,
  dates: IsoDate[],
  opts: LoadFootprintOptions = {},
): Promise<FootprintLoadResult> {
  const symbol = ticker.toUpperCase();
  const today = opts.today ?? todayIso();
  const sorted = [...new Set(dates)].sort();
  const warnings: string[] = [];
  const fetchable = sorted.filter((d) => d <= today);
  if (fetchable.length === 0) {
    return { days: sorted.map((date) => ({ date, alerts: [], oiChanges: [], darkPool: [] })), warnings };
  }
  const skewExpiry = opts.skewExpiry ?? nextMonthlyExpiry(addCalendarDays(fetchable[fetchable.length - 1], 1));
  const [alerts, oi, darkPool, volumeHistory, skew] = await Promise.all([
    loadFlowAlerts(client, cache, symbol, fetchable, today, opts.minFlowPremium, warnings),
    loadPerDate<OiChange>(cache, symbol, fetchable, "oi-change", today, (d) => client.getOiChange(symbol, d), warnings),
    loadPerDate<DarkPoolPrint>(
      cache,
      symbol,
      fetchable,
      "darkpool",
      today,
      (d) => client.getDarkPool(symbol, d, { minPremium: opts.minDarkPoolNotional }),
      warnings,
    ),
    loadVolumeHistory(client, cache, symbol, fetchable, today, warnings),
    loadSkew(client, cache, symbol, fetchable, skewExpiry, today, warnings),
  ]);
  const days = sorted.map((date): DailyFootprint => {
    const pct = volumePercentile(volumeHistory, date);
    return {
      date,
      alerts: alerts.get(date) ?? [],
      oiChanges: oi.get(date) ?? [],
      volumePercentile: pct ?? undefined,
      skew: skew.get(date),
      darkPool: darkPool.get(date) ?? [],
    };
  });
  return { days, warnings };
}

/**
 * `ScoreInput` for a catalyst: footprint window T-5..T-1 (partial when the
 * event is after `today`) plus baseline T-65..T-6, loaded in a single
 * `loadDailyFootprints` call so range fetches coalesce. The skew expiry is
 * the first monthly expiry strictly after the event date.
 */
export async function buildScoreInput(
  client: FootprintClient,
  cache: FootprintCache,
  catalyst: Catalyst,
  opts: { today: IsoDate; otherCatalystsInWindow?: number; skewExpiry?: IsoDate; minDarkPoolNotional?: number },
): Promise<ScoreInputResult> {
  const { eventDate } = catalyst;
  const ticker = catalyst.ticker.toUpperCase();
  const partial = eventDate > opts.today;
  const fp = partial ? partialFootprintWindow(eventDate, opts.today) : footprintWindow(eventDate);
  const base = baselineWindow(eventDate);
  const { days, warnings } = await loadDailyFootprints(client, cache, ticker, [...base, ...fp], {
    today: opts.today,
    skewExpiry: opts.skewExpiry ?? nextMonthlyExpiry(addCalendarDays(eventDate, 1)),
    minDarkPoolNotional: opts.minDarkPoolNotional,
  });
  const byDate = new Map(days.map((d) => [d.date, d]));
  const pick = (ds: IsoDate[]) => ds.map((d) => byDate.get(d)).filter(isDefined);
  return {
    input: {
      ticker,
      eventDate,
      footprintDays: pick(fp),
      baselineDays: pick(base),
      partialWindow: partial,
      otherCatalystsInWindow: opts.otherCatalystsInWindow,
    },
    warnings,
  };
}

/**
 * Verdict inputs: daily bars for `chartWindow(eventDate)` (cached per bar
 * date under `ohlc`, one `getOhlcDaily` call for the missing span) and the
 * implied move in percent — `payload.expected_move_perc` for earnings, else
 * the shortest `days >= 1` horizon of `getInterpolatedIv` on T-1 (the event
 * date itself for after-hours catalysts), cached under `interpolated-iv`.
 */
export async function loadOutcome(
  client: FootprintClient,
  cache: FootprintCache,
  catalyst: Catalyst,
  opts: { today: IsoDate },
): Promise<OutcomeResult> {
  const ticker = catalyst.ticker.toUpperCase();
  const warnings: string[] = [];
  const window = chartWindow(catalyst.eventDate).filter((d) => d <= opts.today);
  const bars = await cache.getMany<OhlcBar>(ticker, window, "ohlc");
  const missing = window.filter((d) => !bars.has(d));
  if (missing.length > 0) {
    try {
      const fetched = await client.getOhlcDaily(ticker, { startDate: missing[0], endDate: missing[missing.length - 1] });
      const wanted = new Set(missing);
      const fresh = new Map<IsoDate, OhlcBar>();
      for (const bar of fetched) if (wanted.has(bar.date)) fresh.set(bar.date, bar);
      await cache.setMany(entries(ticker, "ohlc", fresh, opts.today));
      for (const [d, bar] of fresh) bars.set(d, bar);
    } catch (err) {
      if (!(err instanceof UwAccessError)) throw err;
      warnings.push(accessWarning("ohlc", ticker, err));
    }
  }
  const ohlc = window.map((d) => bars.get(d)).filter(isDefined);

  let impliedMovePct: number | undefined;
  const fromEarnings = catalyst.kind === "earnings" ? numOpt(catalyst.payload?.expected_move_perc) : undefined;
  if (fromEarnings !== undefined && fromEarnings > 0) {
    impliedMovePct = fromEarnings;
  } else {
    const ivDate = catalyst.session === "afterhours" ? catalyst.eventDate : previousTradingDay(catalyst.eventDate);
    if (ivDate <= opts.today) {
      let rows = await cache.get<InterpolatedIvRow[]>(ticker, ivDate, "interpolated-iv");
      if (!rows) {
        try {
          rows = await client.getInterpolatedIv(ticker, ivDate);
          if (ivDate < opts.today) await cache.set(ticker, ivDate, "interpolated-iv", rows);
        } catch (err) {
          if (!(err instanceof UwAccessError)) throw err;
          warnings.push(accessWarning("interpolated-iv", ticker, err));
          rows = [];
        }
      }
      const pick = rows.filter((r) => r.days >= 1).sort((a, b) => a.days - b.days)[0];
      if (pick && pick.impliedMovePct > 0) impliedMovePct = pick.impliedMovePct;
    }
  }
  return { ohlc, impliedMovePct, warnings };
}
