import type { FlowAlert } from "@foreshadow/core";
import type { SampleTrade, TradeTotals } from "./types";

/** How many trades a case page shows as examples. */
export const CASE_SAMPLE_SIZE = 10;
/** How many trades the API and MCP tools return per case. */
export const API_SAMPLE_SIZE = 5;

/**
 * The largest trades as illustrative examples: day, call or put, strike,
 * expiry, amount and sweep flag. No alert ids, timestamps, contract counts or
 * other raw fields, so what leaves the server is a sample of our results
 * rather than a copy of the Unusual Whales rows.
 */
export function sampleTrades(alerts: readonly FlowAlert[], n: number): SampleTrade[] {
  return [...alerts]
    .sort((a, b) => b.premium - a.premium || (a.executedAt < b.executedAt ? -1 : 1))
    .slice(0, n)
    .map((a) => ({
      tradeDate: a.tradeDate,
      type: a.type,
      strike: a.strike,
      expiry: a.expiry,
      premium: a.premium,
      isSweep: a.isSweep,
    }));
}

/** Count and total amount over every flagged trade. */
export function tradeTotals(alerts: readonly FlowAlert[]): TradeTotals {
  return { count: alerts.length, premium: alerts.reduce((sum, a) => sum + a.premium, 0) };
}
