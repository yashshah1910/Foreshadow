import type { FlowAlert, TradeExample } from "./types";

/** Project a flagged trade (or an older stored one) onto the fields Foreshadow keeps. */
export function toTradeExample(a: TradeExample | FlowAlert): TradeExample {
  const t: TradeExample = { tradeDate: a.tradeDate, type: a.type, strike: a.strike, expiry: a.expiry, premium: a.premium, isSweep: a.isSweep };
  return a.side ? { ...t, side: a.side } : t;
}

/** The `n` largest trades by amount, earliest first on ties, as examples. */
export function largestTrades(alerts: readonly FlowAlert[], n: number): TradeExample[] {
  return [...alerts]
    .sort((a, b) => b.premium - a.premium || (a.executedAt < b.executedAt ? -1 : 1))
    .slice(0, n)
    .map(toTradeExample);
}
