/**
 * Foreshadow core types.
 *
 * Everything the scorer consumes is a *normalized* shape produced by
 * `packages/uw` from raw Unusual Whales responses (or by the seed generator).
 * Keeping the scorer independent of the UW wire format means the same
 * function runs in the cron route, the API routes, the MCP server and tests.
 */

export type IsoDate = string; // YYYY-MM-DD (exchange-local trading date)

export type CatalystKind =
  | "fda"
  | "earnings"
  | "congress"
  | "insider"
  | "economic"
  | "potus";

/** When during the trading day the news lands. Drives the verdict window. */
export type CatalystSession = "premarket" | "intraday" | "afterhours" | "unknown";

export type Direction = "bullish" | "bearish" | "mixed";

export type Verdict = "matched" | "missed" | "pending" | "insufficient";

export type OptionType = "call" | "put";

export type OrderSide = "ask" | "bid" | "mid";

export interface Catalyst {
  id: string;
  ticker: string;
  kind: CatalystKind;
  eventDate: IsoDate;
  session: CatalystSession;
  /** Short human label, e.g. "PDUFA: drug name" or "Q3 earnings". */
  title: string;
  source: string;
  payload?: Record<string, unknown>;
}

export interface FlowAlert {
  id: string;
  ticker: string;
  tradeDate: IsoDate;
  executedAt: string; // ISO timestamp
  type: OptionType;
  strike: number;
  expiry: IsoDate;
  /** Total premium of the alert in USD. */
  premium: number;
  /** Contracts. */
  size: number;
  side: OrderSide;
  isSweep: boolean;
  volume?: number;
  openInterest?: number;
  underlyingPrice?: number;
  rule?: string;
}

/**
 * A flagged trade as Foreshadow stores and shows it: the day, call or put,
 * strike, expiry, amount and sweep flag. No Unusual Whales ids, rule names,
 * timestamps, contract counts or other raw fields.
 */
export interface TradeExample {
  tradeDate: IsoDate;
  type: OptionType;
  strike: number;
  expiry: IsoDate;
  /** Total amount paid, USD. */
  premium: number;
  isSweep: boolean;
  /** Which side most of it traded on: "ask" = bought, "bid" = sold. Missing on older rows. */
  side?: OrderSide;
}

export interface OiChange {
  ticker: string;
  tradeDate: IsoDate;
  strike: number;
  expiry: IsoDate;
  type: OptionType;
  /** curOi - prevOi (contracts). */
  oiChange: number;
  prevOi: number;
  curOi: number;
}

export interface DarkPoolPrint {
  id: string;
  ticker: string;
  tradeDate: IsoDate;
  executedAt: string;
  price: number;
  size: number;
  /** price * size in USD. */
  notional: number;
}

export interface OhlcBar {
  ticker: string;
  date: IsoDate;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * One trading day of footprint inputs for a ticker. Any field may be empty
 * when the upstream endpoint returned nothing for that day.
 */
export interface DailyFootprint {
  date: IsoDate;
  alerts: FlowAlert[];
  oiChanges: OiChange[];
  /** Option volume unusualness percentile, 0-100, from UW. */
  volumePercentile?: number;
  /** 25-delta put IV minus call IV for the nearest expiry (decimal, e.g. 0.04). */
  skew?: number;
  darkPool: DarkPoolPrint[];
}

export interface ScoreInput {
  ticker: string;
  eventDate: IsoDate;
  /** Trading days T-5 .. T-1 (may be shorter for a live, partial window). */
  footprintDays: DailyFootprint[];
  /** Trading days T-65 .. T-6 (may be shorter if history is limited). */
  baselineDays: DailyFootprint[];
  /** True when the footprint window has not finished filling (Live Radar). */
  partialWindow?: boolean;
  /** Number of other catalysts for the same ticker inside the footprint window. */
  otherCatalystsInWindow?: number;
}

export type SignalKey =
  | "flowIntensity"
  | "directionalPremium"
  | "openInterest"
  | "volumeUnusualness"
  | "skewShift"
  | "darkPool";

export interface SignalBreakdown {
  key: SignalKey;
  label: string;
  weight: number;
  /** Footprint-window value of the metric (post-transform where noted). */
  footprintValue: number;
  baselineMean: number;
  baselineSd: number;
  /** Raw z used for the score (always >= 0 in `clipped`). */
  z: number;
  /** min(max(z, 0) / 4, 1) */
  clipped: number;
  /** weight * clipped * 100 */
  contribution: number;
  /** Extra numbers rendered beside the signal. */
  detail: Record<string, number>;
}

export interface ScoreFlags {
  insufficientHistory: boolean;
  baselineDaysWithActivity: number;
  isIndexOrEtf: boolean;
  multiCatalyst: boolean;
  partialWindow: boolean;
  footprintDaysUsed: number;
}

export interface ScoreResult {
  ticker: string;
  eventDate: IsoDate;
  /** 0-100, one decimal. */
  score: number;
  direction: Direction;
  /** Signed: positive = bullish, negative = bearish. */
  directionScore: number;
  signals: SignalBreakdown[];
  flags: ScoreFlags;
  /** The five largest trades in the window, largest premium first. */
  topAlerts: TradeExample[];
  /** Daily series used by the Event Card chart. */
  daily: DailyMetrics[];
}

export interface DailyMetrics {
  date: IsoDate;
  alertCount: number;
  alertPremium: number;
  callPremium: number;
  putPremium: number;
  /** Ask-side call premium minus ask-side put premium. */
  netPremium: number;
  /**
   * Calls and puts bought at the asking price: the bets on a rise and on a fall. `callPremium` and
   * `putPremium` also count trades sold at the bid. Missing on rows stored before 2026-10-23.
   */
  boughtCallPremium?: number;
  boughtPutPremium?: number;
  sweepShare: number;
  oiAbs: number;
  oiCallMinusPut: number;
  volumePercentile: number | null;
  skew: number | null;
  darkPoolNotional: number;
}

export interface VerdictInput {
  eventDate: IsoDate;
  session: CatalystSession;
  direction: Direction;
  /** Bars covering at least T-1, T and T+1. */
  ohlc: OhlcBar[];
  /** Implied move for the event, in percent (e.g. 8.5). */
  impliedMovePct?: number;
  today?: IsoDate;
}

export interface VerdictResult {
  verdict: Verdict;
  /** Signed percent move over the reaction window. */
  realizedMovePct: number | null;
  impliedMovePct: number | null;
  /** Whether the implied move came from UW or the documented fallback. */
  impliedSource: "uw" | "fallback" | "none";
  /** "T" = close(T) vs close(T-1); "T+1" = close(T+1) vs close(T). */
  reactionWindow: "T" | "T+1";
  fromDate: IsoDate | null;
  toDate: IsoDate | null;
}

// ---------------------------------------------------------------------------
// Persisted shapes (what the `scores` table and the JSON fixtures hold)
// ---------------------------------------------------------------------------

export type ScoreBandName = "quiet" | "notable" | "someone-knew";

export interface StoredBreakdown {
  signals: SignalBreakdown[];
  directionScore: number;
  /** Stored rows written before 2026-10-23 may still carry raw fields; read through `toTradeExample`. */
  topAlerts: TradeExample[];
  verdict: VerdictResult;
  band: ScoreBandName;
  /** Daily metrics from ~T-11 onwards, for the Event Card chart. */
  daily: DailyMetrics[];
}

export interface StoredScore {
  catalystId: string;
  ticker: string;
  eventDate: IsoDate;
  score: number;
  direction: Direction;
  verdict: Verdict;
  realizedMovePct: number | null;
  impliedMovePct: number | null;
  partialWindow: boolean;
  flags: ScoreFlags;
  breakdown: StoredBreakdown;
  computedAt: string;
}
