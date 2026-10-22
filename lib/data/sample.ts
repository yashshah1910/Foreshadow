import { largestTrades, type FlowAlert } from "@foreshadow/core";
import type { SampleTrade, TradeTotals } from "./types";

/** How many trades a case page shows as examples. */
export const CASE_SAMPLE_SIZE = 10;
/** How many trades the API and MCP tools return per case. */
export const API_SAMPLE_SIZE = 5;

/**
 * The largest trades as illustrative examples (see `TradeExample` in core):
 * what leaves the server is a sample of our results, not the UW rows.
 */
export function sampleTrades(alerts: readonly FlowAlert[], n: number): SampleTrade[] {
  return largestTrades(alerts, n);
}

/** Count and total amount over every flagged trade. */
export function tradeTotals(alerts: readonly FlowAlert[]): TradeTotals {
  return { count: alerts.length, premium: alerts.reduce((sum, a) => sum + a.premium, 0) };
}
