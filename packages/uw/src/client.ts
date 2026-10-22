/**
 * `UwClient` — typed, rate-limited client for the Unusual Whales public API.
 *
 * Every method returns normalized rows (`@foreshadow/core` types or
 * `./types`), never raw UW shapes. The "cost" in each JSDoc counts HTTP 200
 * responses, which is what UW bills against the daily allowance.
 */

import type { Catalyst, DarkPoolPrint, FlowAlert, IsoDate, OhlcBar, OiChange } from "../../core/src/types";
import { parseIso, tradingDaysBetween } from "../../core/src/windows";
import {
  mapCongressRow,
  mapEarningsRow,
  mapEconomicRow,
  mapFdaRow,
  mapInsiderRow,
  mapPotusRow,
  mapUnusualCongressRow,
} from "./catalyst-mappers";
import { UwHttp } from "./http";
import {
  mapDarkPoolRow,
  mapFlowAlert,
  mapInterpolatedIvRow,
  mapOhlcRow,
  mapOiChangeRow,
  mapOptionsVolumeRow,
  mapSkewRow,
  mapUnusualness,
} from "./mappers";
import type {
  DailyOptionVolume,
  EconomicEvent,
  InterpolatedIvRow,
  PotusItem,
  RawCongressTrade,
  RawDarkPoolTrade,
  RawEarningsRow,
  RawEconomicEvent,
  RawFdaRow,
  RawFlowAlert,
  RawInsiderTransaction,
  RawInterpolatedIv,
  RawOhlcBar,
  RawOiChange,
  RawOptionsVolume,
  RawPotusEntry,
  RawSkew,
  RawUnusualCongressTrade,
  RawUnusualness,
  SkewPoint,
  Unusualness,
} from "./types";
import { etTradeDate, isDefined, isRecord, strOpt } from "./util";

export const FLOW_PAGE_SIZE = 200;
export const MAX_FLOW_PAGES = 50;
export const OI_PAGE_SIZE = 500;
export const MAX_OI_PAGES = 10;
export const DARK_POOL_PAGE_SIZE = 500;
export const MAX_DARK_POOL_PAGES = 10;
export const MAX_DARK_POOL_RANGE_PAGES = 60;
export const DEFAULT_DARK_POOL_MIN_PREMIUM = 1_000_000;
export const MAX_OHLC_LIMIT = 2500;
export const MAX_OPTIONS_VOLUME_LIMIT = 500;
export const EARNINGS_PAGE_SIZE = 100;
export const INSIDER_PAGE_SIZE = 500;
const MAX_EARNINGS_PAGES = 10;
const MAX_INSIDER_PAGES = 20;

export interface FlowAlertParams {
  ticker: string;
  /** Unix s/ms, ISO date or RFC 3339; inclusive lower bound on `created_at`. */
  newerThan: string;
  /** Exclusive upper bound on `created_at`. */
  olderThan: string;
  minPremium?: number;
}

function encode(ticker: string): string {
  return encodeURIComponent(ticker.toUpperCase());
}

export class UwClient extends UwHttp {
  /**
   * `GET /api/option-trades/flow-alerts` for one ticker inside a time range.
   * Pages of 200 using the `older_than` cursor (oldest `created_at` of the
   * previous page) until a short page, capped at 50 pages. Cost: one request
   * per 200 alerts. Rows come back oldest-first, de-duplicated by id.
   */
  async getFlowAlerts(params: FlowAlertParams): Promise<FlowAlert[]> {
    const ticker = params.ticker.toUpperCase();
    const byId = new Map<string, FlowAlert>();
    let olderThan: string | undefined = params.olderThan;
    for (let page = 0; page < MAX_FLOW_PAGES; page++) {
      const rows = await this.requestList<RawFlowAlert>("/api/option-trades/flow-alerts", {
        ticker_symbol: ticker,
        newer_than: params.newerThan,
        older_than: olderThan,
        min_premium: params.minPremium,
        limit: FLOW_PAGE_SIZE,
      });
      let oldest: string | undefined;
      for (const row of rows) {
        const alert = mapFlowAlert(row, ticker);
        if (!alert) continue;
        byId.set(alert.id, alert);
        if (oldest === undefined || alert.executedAt < oldest) oldest = alert.executedAt;
      }
      if (rows.length < FLOW_PAGE_SIZE || oldest === undefined || oldest === olderThan) break;
      olderThan = oldest;
    }
    return [...byId.values()].sort((a, b) => a.executedAt.localeCompare(b.executedAt));
  }

  /**
   * `GET /api/stock/{ticker}/oi-change?date=` — contracts ranked by |OI change|
   * for one past trading day. Pages of 500 via `page` until a short page,
   * capped at 10 pages. Cost: one request per 500 contracts (usually one).
   */
  async getOiChange(ticker: string, date: IsoDate): Promise<OiChange[]> {
    const out: OiChange[] = [];
    for (let page = 0; page < MAX_OI_PAGES; page++) {
      const rows = await this.requestList<RawOiChange>(`/api/stock/${encode(ticker)}/oi-change`, {
        date,
        limit: OI_PAGE_SIZE,
        page,
      });
      for (const row of rows) {
        const mapped = mapOiChangeRow(row, ticker, date);
        if (mapped) out.push(mapped);
      }
      if (rows.length < OI_PAGE_SIZE) break;
    }
    return out;
  }

  /**
   * `GET /api/darkpool/{ticker}` over a time range (`newer_than` / `older_than`),
   * paging backwards with the `older_than` cursor. With the $1M server-side
   * floor a quiet ticker's whole window is one request; liquid names page
   * through ~3 sessions per call. Far cheaper than one call per day.
   */
  async getDarkPoolRange(params: { ticker: string; newerThan: string; olderThan: string; minPremium?: number }): Promise<DarkPoolPrint[]> {
    const minPremium = params.minPremium ?? DEFAULT_DARK_POOL_MIN_PREMIUM;
    const byId = new Map<string, DarkPoolPrint>();
    let olderThan = params.olderThan;
    for (let page = 0; page < MAX_DARK_POOL_RANGE_PAGES; page++) {
      const rows = await this.requestList<RawDarkPoolTrade>(`/api/darkpool/${encode(params.ticker)}`, {
        newer_than: params.newerThan,
        older_than: olderThan,
        min_premium: minPremium,
        limit: DARK_POOL_PAGE_SIZE,
      });
      let oldest: string | undefined;
      for (const row of rows) {
        const ts = strOpt(row.executed_at);
        if (!ts) continue;
        if (oldest === undefined || ts < oldest) oldest = ts;
        const print = mapDarkPoolRow(row, params.ticker, etTradeDate(ts));
        if (print) byId.set(print.id, print);
      }
      if (rows.length < DARK_POOL_PAGE_SIZE || oldest === undefined || oldest === olderThan) break;
      olderThan = oldest;
    }
    return [...byId.values()].sort((a, b) => a.executedAt.localeCompare(b.executedAt));
  }

  /**
   * `GET /api/darkpool/{ticker}?date=&min_premium=` — off-exchange prints for
   * one day at or above `minPremium` notional (default $1M). Pages of 500 via
   * `older_than` = oldest `executed_at` while pages are full, capped at 10.
   * Canceled prints are skipped. Cost: one request per 500 prints.
   */
  async getDarkPool(ticker: string, date: IsoDate, opts: { minPremium?: number } = {}): Promise<DarkPoolPrint[]> {
    const minPremium = opts.minPremium ?? DEFAULT_DARK_POOL_MIN_PREMIUM;
    const byId = new Map<string, DarkPoolPrint>();
    let olderThan: string | undefined;
    for (let page = 0; page < MAX_DARK_POOL_PAGES; page++) {
      const rows = await this.requestList<RawDarkPoolTrade>(`/api/darkpool/${encode(ticker)}`, {
        date,
        min_premium: minPremium,
        limit: DARK_POOL_PAGE_SIZE,
        older_than: olderThan,
      });
      let oldest: string | undefined;
      for (const row of rows) {
        const ts = strOpt(row.executed_at);
        if (ts && (oldest === undefined || ts < oldest)) oldest = ts;
        const print = mapDarkPoolRow(row, ticker, date);
        if (print) byId.set(print.id, print);
      }
      if (rows.length < DARK_POOL_PAGE_SIZE || oldest === undefined || oldest === olderThan) break;
      olderThan = oldest;
    }
    return [...byId.values()].sort((a, b) => a.executedAt.localeCompare(b.executedAt));
  }

  /**
   * `GET /api/stock/{ticker}/ohlc/1d?end_date=&limit=&timeframe=` — daily bars
   * covering `startDate..endDate` (inclusive). `limit` is derived from the
   * span (max 2500) and `timeframe` (in weeks, with a one-week margin) bounds
   * the search window so the server's 1Y default never truncates a long span.
   * Rows outside the range are dropped. Cost: one request.
   */
  async getOhlcDaily(ticker: string, range: { startDate: IsoDate; endDate: IsoDate }): Promise<OhlcBar[]> {
    const { startDate, endDate } = range;
    if (startDate > endDate) return [];
    const calendarDays = Math.round(
      (parseIso(endDate).getTime() - parseIso(startDate).getTime()) / 86_400_000,
    );
    // Daily candles come back one row per session part (pr / r / po), newest first,
    // so ask for three rows per trading day and keep the regular-session bar.
    const limit = Math.min(MAX_OHLC_LIMIT, Math.max(1, tradingDaysBetween(startDate, endDate).length * 3 + 30));
    const timeframe = `${Math.ceil(calendarDays / 7) + 1}W`;
    const rows = await this.requestList<RawOhlcBar>(`/api/stock/${encode(ticker)}/ohlc/1d`, {
      end_date: endDate,
      limit,
      timeframe,
    });
    // Prefer the regular session ("r"); rows without market_time next; pre/post only as a last resort.
    const rank = (mt: string | null | undefined) => (mt === "r" ? 0 : mt == null || mt === "" ? 1 : 2);
    const byDate = new Map<IsoDate, { bar: OhlcBar; rank: number }>();
    for (const row of rows) {
      const bar = mapOhlcRow(row, ticker);
      if (!bar || bar.date < startDate || bar.date > endDate) continue;
      const r = rank(row.market_time);
      const prev = byDate.get(bar.date);
      if (!prev || r < prev.rank) byDate.set(bar.date, { bar, rank: r });
    }
    return [...byDate.values()].map((v) => v.bar).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * `GET /api/stock/{ticker}/interpolated-iv?date=` — one row per horizon
   * (1, 5, 7, 14, 30 days...) with the implied move in percent. Cost: one request.
   */
  async getInterpolatedIv(ticker: string, date: IsoDate): Promise<InterpolatedIvRow[]> {
    const rows = await this.requestList<RawInterpolatedIv>(`/api/stock/${encode(ticker)}/interpolated-iv`, { date });
    return rows.map((r) => mapInterpolatedIvRow(r, date)).filter(isDefined).sort((a, b) => a.days - b.days);
  }

  /**
   * `GET /api/stock/{ticker}/unusualness` — today's stock/option volume
   * percentile vs the trailing ~90 days. No date parameter (latest day only);
   * the envelope is `{ data: {single object} }`. Cost: one request.
   */
  async getUnusualness(ticker: string): Promise<Unusualness> {
    const data = await this.request<unknown>(`/api/stock/${encode(ticker)}/unusualness`);
    return mapUnusualness(isRecord(data) ? (data as RawUnusualness) : {});
  }

  /**
   * `GET /api/stock/{ticker}/options-volume?limit=` — daily call/put volume
   * and premium for the last `limit` trading days (default 120, max 500),
   * returned oldest-first. Feed the result to `volumePercentile()` to rebuild
   * the unusualness percentile for any past date. Cost: one request.
   */
  async getOptionsVolumeHistory(ticker: string, opts: { limit?: number } = {}): Promise<DailyOptionVolume[]> {
    const limit = Math.min(MAX_OPTIONS_VOLUME_LIMIT, Math.max(1, opts.limit ?? 120));
    const rows = await this.requestList<RawOptionsVolume>(`/api/stock/${encode(ticker)}/options-volume`, { limit });
    const byDate = new Map<IsoDate, DailyOptionVolume>();
    for (const row of rows) {
      const mapped = mapOptionsVolumeRow(row);
      if (mapped) byDate.set(mapped.date, mapped);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * `GET /api/stock/{ticker}/historical-risk-reversal-skew?expiry=&delta=&timeframe=&date=`
   * — put IV minus call IV at `delta` (default 25) for one expiry, one row per
   * trading day over `timeframe` (default 1Y) ending at `date`. Cost: one request.
   */
  async getRiskReversalSkew(
    ticker: string,
    opts: { expiry: IsoDate; delta?: "10" | "25"; timeframe?: string; date?: IsoDate },
  ): Promise<SkewPoint[]> {
    const rows = await this.requestList<RawSkew>(`/api/stock/${encode(ticker)}/historical-risk-reversal-skew`, {
      expiry: opts.expiry,
      delta: opts.delta ?? "25",
      timeframe: opts.timeframe ?? "1Y",
      date: opts.date,
    });
    return rows.map((r) => mapSkewRow(r, opts.expiry)).filter(isDefined).sort((a, b) => a.date.localeCompare(b.date));
  }

  // -------------------------------------------------------------------------
  // Catalyst endpoints
  // -------------------------------------------------------------------------

  /**
   * `GET /api/market/fda-calendar?target_date_min=&target_date_max=&limit=` —
   * PDUFA dates, AdCom meetings etc. as kind `fda`. No paging (limit max 500).
   * Cost: one request.
   */
  async getFdaCalendar(
    params: { targetDateMin?: string; targetDateMax?: string; ticker?: string; limit?: number } = {},
  ): Promise<Catalyst[]> {
    const rows = await this.requestList<RawFdaRow>("/api/market/fda-calendar", {
      target_date_min: params.targetDateMin,
      target_date_max: params.targetDateMax,
      ticker: params.ticker,
      limit: Math.min(500, params.limit ?? 500),
    });
    return rows.map(mapFdaRow).filter(isDefined);
  }

  /**
   * `GET /api/earnings/premarket?date=` and `GET /api/earnings/afterhours?date=`
   * — every reporter on `date`, both sessions, as kind `earnings`. Each
   * endpoint pages 100 at a time via `page` until a short page. Cost: two
   * requests per date plus one per extra 100 reporters.
   */
  async getEarnings(date: IsoDate): Promise<Catalyst[]> {
    const sessions = [
      { path: "/api/earnings/premarket", session: "premarket" as const },
      { path: "/api/earnings/afterhours", session: "afterhours" as const },
    ];
    const results = await Promise.all(
      sessions.map(async ({ path, session }) => {
        const out: Catalyst[] = [];
        for (let page = 0; page < MAX_EARNINGS_PAGES; page++) {
          const rows = await this.requestList<RawEarningsRow>(path, { date, limit: EARNINGS_PAGE_SIZE, page });
          for (const row of rows) {
            const mapped = mapEarningsRow(row, session, date);
            if (mapped) out.push(mapped);
          }
          if (rows.length < EARNINGS_PAGE_SIZE) break;
        }
        return out;
      }),
    );
    return results.flat();
  }

  /**
   * `GET /api/congress/recent-trades?date=&limit=200&ticker=` — trades with
   * `transaction_date <= date`, newest first, as kind `congress`. No `page`:
   * walk `date` backwards to go further. Cost: one request.
   */
  async getCongressTrades(params: { date?: IsoDate; ticker?: string; limit?: number } = {}): Promise<Catalyst[]> {
    const rows = await this.requestList<RawCongressTrade>("/api/congress/recent-trades", {
      date: params.date,
      ticker: params.ticker?.toUpperCase(),
      limit: Math.min(200, params.limit ?? 200),
    });
    return rows.map(mapCongressRow).filter(isDefined);
  }

  /**
   * `GET /api/congress/unusual-trades?types=&limit=&page=` — the premium
   * flagged feed (`payload.tags`, e.g. `committee_conflict`). `page` is
   * 1-indexed here. Throws `UwAccessError` (403) without the politics scope;
   * callers must tolerate that. Cost: one request.
   */
  async getUnusualCongressTrades(params: { types?: string[]; limit?: number; page?: number } = {}): Promise<Catalyst[]> {
    const rows = await this.requestList<RawUnusualCongressTrade>("/api/congress/unusual-trades", {
      types: params.types?.length ? params.types.join(",") : undefined,
      limit: Math.min(500, params.limit ?? 500),
      page: params.page ?? 1,
    });
    return rows.map(mapUnusualCongressRow).filter(isDefined);
  }

  /**
   * `GET /api/insider/transactions?start_date=&end_date=&min_value=&transaction_codes[]=P&transaction_codes[]=S&common_stock_only=true&limit=500&page=`
   * — open-market buys/sells of at least `minValue` (default $1M) as kind
   * `insider`, paging 500 at a time until a short page (cap 20 pages).
   * Cost: one request per 500 rows.
   */
  async getInsiderTransactions(params: {
    startDate: IsoDate;
    endDate: IsoDate;
    minValue?: number;
    ticker?: string;
  }): Promise<Catalyst[]> {
    const out: Catalyst[] = [];
    for (let page = 0; page < MAX_INSIDER_PAGES; page++) {
      const rows = await this.requestList<RawInsiderTransaction>("/api/insider/transactions", {
        start_date: params.startDate,
        end_date: params.endDate,
        min_value: params.minValue ?? 1_000_000,
        ticker_symbol: params.ticker?.toUpperCase(),
        transaction_codes: ["P", "S"],
        common_stock_only: true,
        limit: INSIDER_PAGE_SIZE,
        page,
      });
      for (const row of rows) {
        const mapped = mapInsiderRow(row);
        if (mapped) out.push(mapped);
      }
      if (rows.length < INSIDER_PAGE_SIZE) break;
    }
    return out;
  }

  /**
   * `GET /api/potus/schedule?date=&limit=200` — the President's published
   * schedule for `date` (most recent scheduled date when omitted). Not
   * ticker-shaped; the tagger assigns tickers later. Cost: one request.
   */
  async getPotusSchedule(date?: IsoDate): Promise<PotusItem[]> {
    const rows = await this.requestList<RawPotusEntry>("/api/potus/schedule", { date, limit: 200 });
    return rows.map((r) => mapPotusRow(r, date)).filter(isDefined);
  }

  /**
   * `GET /api/market/economic-calendar` — Fed speakers, FOMC and data
   * releases for the current and next week. No parameters. Cost: one request.
   */
  async getEconomicCalendar(): Promise<EconomicEvent[]> {
    const rows = await this.requestList<RawEconomicEvent>("/api/market/economic-calendar");
    return rows.map(mapEconomicRow).filter(isDefined);
  }
}
