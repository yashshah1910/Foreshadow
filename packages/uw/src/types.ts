/**
 * Wire shapes (`Raw*`) of the Unusual Whales endpoints this package consumes,
 * plus normalized shapes that have no counterpart in `@foreshadow/core`.
 *
 * Raw interfaces are deliberately loose: UW sends decimals as JSON strings,
 * leaves many fields untyped in its OpenAPI spec and sometimes omits keys.
 * Every raw field is optional and numeric-looking fields are `UwNumeric`;
 * `mappers.ts` / `catalyst-mappers.ts` coerce them with `num()`.
 */

import type { IsoDate } from "../../core/src/types";

/** A number UW serialises as a JSON string ("4.05"), an integer, or null. */
export type UwNumeric = string | number | null;

// ---------------------------------------------------------------------------
// Raw rows (footprint endpoints)
// ---------------------------------------------------------------------------

/** `GET /api/option-trades/flow-alerts` row. `id` is undocumented but expected. */
export interface RawFlowAlert {
  id?: string | null;
  alert_rule?: string | null;
  all_opening_trades?: boolean | null;
  created_at?: string | null;
  delta?: number | null;
  expiry?: string | null;
  expiry_count?: number | null;
  has_floor?: boolean | null;
  has_multileg?: boolean | null;
  has_singleleg?: boolean | null;
  has_sweep?: boolean | null;
  issue_type?: string | null;
  iv?: number | null;
  open_interest?: UwNumeric;
  option_chain?: string | null;
  price?: UwNumeric;
  strike?: UwNumeric;
  ticker?: string | null;
  total_ask_side_prem?: UwNumeric;
  total_bid_side_prem?: UwNumeric;
  total_premium?: UwNumeric;
  total_size?: UwNumeric;
  trade_count?: UwNumeric;
  type?: string | null;
  underlying_price?: UwNumeric;
  volume?: UwNumeric;
  volume_oi_ratio?: UwNumeric;
}

/** `GET /api/stock/{ticker}/oi-change` row (no strike/expiry fields: parse `option_symbol`). */
export interface RawOiChange {
  avg_price?: UwNumeric;
  curr_date?: string | null;
  curr_oi?: UwNumeric;
  last_ask?: UwNumeric;
  last_bid?: UwNumeric;
  last_date?: string | null;
  last_fill?: UwNumeric;
  last_oi?: UwNumeric;
  oi_change?: UwNumeric;
  oi_diff_plain?: UwNumeric;
  option_symbol?: string | null;
  percentage_of_total?: UwNumeric;
  prev_total_premium?: UwNumeric;
  rnk?: UwNumeric;
  trades?: UwNumeric;
  underlying_symbol?: string | null;
  volume?: UwNumeric;
}

/** `GET /api/darkpool/{ticker}` row. */
export interface RawDarkPoolTrade {
  canceled?: boolean | null;
  executed_at?: string | null;
  ext_hour_sold_codes?: string | null;
  market_center?: string | null;
  nbbo_ask?: UwNumeric;
  nbbo_bid?: UwNumeric;
  premium?: UwNumeric;
  price?: UwNumeric;
  sale_cond_codes?: string | null;
  size?: UwNumeric;
  ticker?: string | null;
  tracking_id?: UwNumeric;
  trade_code?: string | null;
  trade_settlement?: string | null;
  trf_executed_at?: string | null;
  volume?: UwNumeric;
}

/** `GET /api/stock/{ticker}/ohlc/{candle_size}` row. Daily rows carry `date`, not `start_time`. */
export interface RawOhlcBar {
  open?: UwNumeric;
  high?: UwNumeric;
  low?: UwNumeric;
  close?: UwNumeric;
  volume?: UwNumeric;
  total_volume?: UwNumeric;
  start_time?: string | null;
  end_time?: string | null;
  market_time?: string | null;
  date?: string | null;
}

/** `GET /api/stock/{ticker}/interpolated-iv` row (one per horizon in days). */
export interface RawInterpolatedIv {
  date?: string | null;
  days?: UwNumeric;
  implied_move_perc?: UwNumeric;
  percentile?: UwNumeric;
  volatility?: UwNumeric;
}

/** `GET /api/stock/{ticker}/unusualness` — a single object under `data`. */
export interface RawUnusualness {
  date?: string | null;
  opt_samples?: UwNumeric;
  opt_vol_decile?: UwNumeric;
  opt_vol_pctile?: UwNumeric;
  stock_samples?: UwNumeric;
  stock_vol_decile?: UwNumeric;
  stock_vol_pctile?: UwNumeric;
}

/** `GET /api/stock/{ticker}/options-volume` row (one per trading day). */
export interface RawOptionsVolume {
  date?: string | null;
  call_volume?: UwNumeric;
  put_volume?: UwNumeric;
  call_premium?: UwNumeric;
  put_premium?: UwNumeric;
  call_open_interest?: UwNumeric;
  put_open_interest?: UwNumeric;
  bullish_premium?: UwNumeric;
  bearish_premium?: UwNumeric;
  net_call_premium?: UwNumeric;
  net_put_premium?: UwNumeric;
}

/** `GET /api/stock/{ticker}/historical-risk-reversal-skew` row. */
export interface RawSkew {
  date?: string | null;
  delta?: UwNumeric;
  risk_reversal?: UwNumeric;
  ticker?: string | null;
}

// ---------------------------------------------------------------------------
// Raw rows (catalyst endpoints)
// ---------------------------------------------------------------------------

/** `GET /api/market/fda-calendar` row. */
export interface RawFdaRow {
  catalyst?: string | null;
  description?: string | null;
  drug?: string | null;
  end_date?: string | null;
  has_options?: boolean | null;
  indication?: string | null;
  marketcap?: UwNumeric;
  notes?: string | null;
  outcome?: string | null;
  outcome_brief?: string | null;
  source_link?: string | null;
  start_date?: string | null;
  status?: string | null;
  ticker?: string | null;
}

/** `GET /api/earnings/premarket|afterhours` row. */
export interface RawEarningsRow {
  actual_eps?: UwNumeric;
  ending_fiscal_quarter?: string | null;
  expected_move?: UwNumeric;
  expected_move_perc?: UwNumeric;
  full_name?: string | null;
  has_options?: boolean | null;
  is_s_p_500?: boolean | null;
  marketcap?: UwNumeric;
  post_earnings_close?: UwNumeric;
  post_earnings_date?: string | null;
  pre_earnings_close?: UwNumeric;
  pre_earnings_date?: string | null;
  reaction?: UwNumeric;
  report_date?: string | null;
  report_time?: string | null;
  sector?: string | null;
  source?: string | null;
  street_mean_est?: UwNumeric;
  symbol?: string | null;
}

/** `GET /api/congress/recent-trades` row (schema `Senate Stock`). */
export interface RawCongressTrade {
  amounts?: string | null;
  filed_at_date?: string | null;
  is_active?: boolean | string | null;
  issuer?: string | null;
  member_type?: string | boolean | null;
  name?: string | null;
  notes?: string | null;
  politician_id?: string | null;
  reporter?: string | null;
  ticker?: string | null;
  transaction_date?: string | null;
  txn_type?: string | null;
}

/** `GET /api/congress/unusual-trades` row (premium endpoint). */
export interface RawUnusualCongressTrade {
  id?: string | null;
  politician_id?: string | null;
  politician_name?: string | null;
  ticker?: string | null;
  company_name?: string | null;
  asset?: string | null;
  asset_type?: string | null;
  transaction_type?: string | null;
  transaction_date?: string | null;
  filing_date?: string | null;
  amount?: string | null;
  description?: string | null;
  unusual_activity_tags?: string[] | null;
  unusual_activity_meta?: unknown[] | null;
}

/** `GET /api/insider/transactions` row (aggregated per person/day/code). */
export interface RawInsiderTransaction {
  accession_no?: string | null;
  amount?: UwNumeric;
  filing_date?: string | null;
  formtype?: string | null;
  ids?: string[] | null;
  is_10b5_1?: boolean | null;
  is_director?: boolean | null;
  is_officer?: boolean | null;
  is_ten_percent_owner?: boolean | null;
  issuer_cik?: string | null;
  officer_title?: string | null;
  owner_name?: string | null;
  price?: UwNumeric;
  reporter_cik?: string | null;
  security_title?: string | null;
  shares_owned_after?: UwNumeric;
  shares_owned_before?: UwNumeric;
  ticker?: string | null;
  transaction_code?: string | null;
  transaction_date?: string | null;
  transactions?: UwNumeric;
  marketcap?: UwNumeric;
  sector?: string | null;
  is_s_p_500?: boolean | null;
}

/** `GET /api/potus/schedule` row. */
export interface RawPotusEntry {
  coverage?: string | null;
  date?: string | null;
  details?: string | null;
  location?: string | null;
  time?: string | null;
  type?: string | null;
  url?: string | null;
  video_url?: string | null;
}

/** `GET /api/market/economic-calendar` row. */
export interface RawEconomicEvent {
  event?: string | null;
  forecast?: string | null;
  prev?: string | null;
  reported_period?: string | null;
  time?: string | null;
  type?: string | null;
}

// ---------------------------------------------------------------------------
// Normalized shapes without a `@foreshadow/core` counterpart
// ---------------------------------------------------------------------------

export interface InterpolatedIvRow {
  date: IsoDate;
  /** Horizon in days to expiration. */
  days: number;
  /** Interpolated IV as a decimal (0.299 = 29.9%). */
  volatility: number;
  /** Expected move over the horizon, in percent (5.8 = 5.8%). */
  impliedMovePct: number;
  /** 1-year percentile of this IV, 0-100. */
  percentile: number;
}

export interface Unusualness {
  date: IsoDate;
  /** Option-volume percentile vs the trailing ~90 days (null below 30 samples). */
  optVolPctile: number | null;
  stockVolPctile: number | null;
  optSamples: number;
  stockSamples: number;
}

export interface DailyOptionVolume {
  date: IsoDate;
  callVolume: number;
  putVolume: number;
  /** callVolume + putVolume (UW sends no total). */
  totalVolume: number;
  callPremium?: number;
  putPremium?: number;
}

export interface SkewPoint {
  date: IsoDate;
  /** 10 or 25. */
  delta: number;
  /** Put IV minus call IV at `delta`, as a decimal (0.04 = 4 vol points). */
  skew: number;
  expiry: IsoDate;
}

export interface PotusItem {
  date: IsoDate;
  /** ISO 8601 UTC start time, when published. */
  time: string | null;
  type: string;
  details: string | null;
  location: string | null;
  url: string | null;
}

export interface EconomicEvent {
  /** ISO 8601 UTC. */
  time: string;
  event: string;
  /** `fed-speaker` | `fomc` | `report`. */
  type: string;
  forecast: string | null;
  prev: string | null;
  reportedPeriod: string | null;
}

/** Latest `x-uw-*` usage headers seen by the client. */
export interface UwUsage {
  dailyCount: number | null;
  dailyLimit: number | null;
  minuteRemaining: number | null;
  /** Milliseconds until the per-minute counter resets (as of `updatedAt`). */
  minuteResetMs: number | null;
  updatedAt: string | null;
}
