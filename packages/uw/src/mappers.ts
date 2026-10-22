/**
 * Raw UW row -> normalized footprint shapes. Pure functions; every numeric
 * field goes through `num()` because UW serialises decimals as strings.
 */

import type { DarkPoolPrint, FlowAlert, IsoDate, OhlcBar, OiChange, OrderSide } from "../../core/src/types";
import { parseOccSymbol } from "./occ";
import type {
  DailyOptionVolume,
  InterpolatedIvRow,
  RawDarkPoolTrade,
  RawFlowAlert,
  RawInterpolatedIv,
  RawOhlcBar,
  RawOiChange,
  RawOptionsVolume,
  RawSkew,
  RawUnusualness,
  SkewPoint,
  Unusualness,
} from "./types";
import { bool, etTradeDate, num, numOpt, stableHash, strOpt } from "./util";

/**
 * Flow alert. `side` is derived from the ask/bid premium split (UW has no
 * side string), `tradeDate` is the ET date of `created_at`, and the id falls
 * back to a stable hash when UW omits `id`.
 */
export function mapFlowAlert(row: RawFlowAlert, fallbackTicker: string): FlowAlert | null {
  const createdAt = strOpt(row.created_at);
  if (!createdAt) return null;
  const ticker = (strOpt(row.ticker) ?? fallbackTicker).toUpperCase();
  const occ = row.option_chain ? parseOccSymbol(row.option_chain) : null;
  const type = row.type === "put" ? "put" : row.type === "call" ? "call" : occ?.type;
  if (!type) return null;
  const expiry = strOpt(row.expiry) ?? occ?.expiry;
  if (!expiry) return null;
  const ask = num(row.total_ask_side_prem);
  const bid = num(row.total_bid_side_prem);
  const side: OrderSide = ask > bid ? "ask" : bid > ask ? "bid" : "mid";
  const id =
    strOpt(row.id) ??
    stableHash(`${ticker}|${createdAt}|${row.option_chain ?? ""}|${row.total_premium ?? ""}`);
  return {
    id,
    ticker,
    tradeDate: etTradeDate(createdAt),
    executedAt: createdAt,
    type,
    strike: numOpt(row.strike) ?? occ?.strike ?? 0,
    expiry,
    premium: num(row.total_premium),
    size: num(row.total_size),
    side,
    isSweep: bool(row.has_sweep),
    volume: numOpt(row.volume),
    openInterest: numOpt(row.open_interest),
    underlyingPrice: numOpt(row.underlying_price),
    rule: strOpt(row.alert_rule),
  };
}

/** OI change row; contracts whose `option_symbol` does not parse are dropped. */
export function mapOiChangeRow(row: RawOiChange, ticker: string, date: IsoDate): OiChange | null {
  const occ = row.option_symbol ? parseOccSymbol(row.option_symbol) : null;
  if (!occ) return null;
  const prevOi = num(row.last_oi);
  const curOi = num(row.curr_oi);
  return {
    ticker: ticker.toUpperCase(),
    tradeDate: strOpt(row.curr_date) ?? date,
    strike: occ.strike,
    expiry: occ.expiry,
    type: occ.type,
    oiChange: numOpt(row.oi_diff_plain) ?? curOi - prevOi,
    prevOi,
    curOi,
  };
}

/** Dark pool print; canceled rows and rows without a timestamp are dropped. */
export function mapDarkPoolRow(row: RawDarkPoolTrade, ticker: string, date: IsoDate): DarkPoolPrint | null {
  if (row.canceled === true) return null;
  const executedAt = strOpt(row.executed_at);
  if (!executedAt) return null;
  const price = num(row.price);
  const size = num(row.size);
  const trackingId = row.tracking_id;
  const id =
    trackingId !== undefined && trackingId !== null
      ? String(trackingId)
      : stableHash(`${ticker}|${executedAt}|${price}|${size}`);
  return {
    id,
    ticker: ticker.toUpperCase(),
    tradeDate: date,
    executedAt,
    price,
    size,
    notional: numOpt(row.premium) ?? price * size,
  };
}

/** Daily OHLC bar; `date` falls back to the first 10 chars of `start_time`. */
export function mapOhlcRow(row: RawOhlcBar, ticker: string): OhlcBar | null {
  const date = strOpt(row.date) ?? strOpt(row.start_time)?.slice(0, 10);
  if (!date) return null;
  return {
    ticker: ticker.toUpperCase(),
    date,
    open: num(row.open),
    high: num(row.high),
    low: num(row.low),
    close: num(row.close),
    volume: num(row.volume),
  };
}

/** Interpolated IV row; `implied_move_perc` (fraction) becomes percent. */
export function mapInterpolatedIvRow(row: RawInterpolatedIv, fallbackDate: IsoDate): InterpolatedIvRow | null {
  const days = numOpt(row.days);
  if (days === undefined) return null;
  return {
    date: strOpt(row.date) ?? fallbackDate,
    days,
    volatility: num(row.volatility),
    impliedMovePct: Math.round(num(row.implied_move_perc) * 1e6) / 1e4,
    percentile: num(row.percentile),
  };
}

/** The single-object `unusualness` payload. */
export function mapUnusualness(row: RawUnusualness): Unusualness {
  return {
    date: strOpt(row.date) ?? "",
    optVolPctile: numOpt(row.opt_vol_pctile) ?? null,
    stockVolPctile: numOpt(row.stock_vol_pctile) ?? null,
    optSamples: num(row.opt_samples),
    stockSamples: num(row.stock_samples),
  };
}

/** Daily options volume row; `totalVolume` is computed (UW sends no total). */
export function mapOptionsVolumeRow(row: RawOptionsVolume): DailyOptionVolume | null {
  const date = strOpt(row.date)?.slice(0, 10);
  if (!date) return null;
  const callVolume = num(row.call_volume);
  const putVolume = num(row.put_volume);
  return {
    date,
    callVolume,
    putVolume,
    totalVolume: callVolume + putVolume,
    callPremium: numOpt(row.call_premium),
    putPremium: numOpt(row.put_premium),
  };
}

/** Risk-reversal skew row. */
export function mapSkewRow(row: RawSkew, expiry: IsoDate): SkewPoint | null {
  const date = strOpt(row.date);
  if (!date) return null;
  return { date, delta: num(row.delta), skew: num(row.risk_reversal), expiry };
}
