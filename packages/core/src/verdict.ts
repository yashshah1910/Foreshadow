/**
 * Verdict: did the footprint match the move?
 *
 * Reaction window:
 *   premarket / intraday / unknown  ->  close(T)   vs close(T-1)
 *   afterhours                      ->  close(T+1) vs close(T)
 *
 * "matched" when |realized| >= 1x implied move AND the sign agrees with the
 * footprint direction. A "mixed" direction can never match.
 */

import type { IsoDate, OhlcBar, VerdictInput, VerdictResult } from "./types";
import { nextTradingDay, previousTradingDay, onOrAfterTradingDay, todayIso } from "./windows";

/** Used when UW has no implied move for the event. Stated in the README. */
export const FALLBACK_IMPLIED_MOVE_PCT = 4;

/**
 * Straddle-style implied move: ~0.8 x IV x sqrt(days to expiry / 365).
 * `iv` is a decimal (0.65 = 65%); returns percent.
 */
export function impliedMoveFromIv(iv: number, daysToExpiry: number): number {
  const dte = Math.max(1, daysToExpiry);
  return 0.8 * iv * Math.sqrt(dte / 365) * 100;
}

export function reactionWindowFor(eventDate: IsoDate, session: VerdictInput["session"]) {
  const t = onOrAfterTradingDay(eventDate);
  if (session === "afterhours") {
    return { reactionWindow: "T+1" as const, from: t, to: nextTradingDay(t) };
  }
  return { reactionWindow: "T" as const, from: previousTradingDay(t), to: t };
}

export function computeVerdict(input: VerdictInput): VerdictResult {
  const { reactionWindow, from, to } = reactionWindowFor(input.eventDate, input.session);
  const today = input.today ?? todayIso();
  const byDate = new Map<IsoDate, OhlcBar>();
  for (const b of input.ohlc) byDate.set(b.date, b);
  const fromBar = byDate.get(from);
  const toBar = byDate.get(to);

  const impliedSource = input.impliedMovePct != null ? "uw" : "fallback";
  const impliedMovePct = input.impliedMovePct ?? FALLBACK_IMPLIED_MOVE_PCT;

  if (!fromBar || !toBar) {
    return {
      verdict: to > today ? "pending" : "insufficient",
      realizedMovePct: null,
      impliedMovePct,
      impliedSource,
      reactionWindow,
      fromDate: from,
      toDate: to,
    };
  }

  const realized = ((toBar.close - fromBar.close) / fromBar.close) * 100;
  const bigEnough = Math.abs(realized) >= impliedMovePct;
  const signAgrees =
    (input.direction === "bullish" && realized > 0) ||
    (input.direction === "bearish" && realized < 0);

  return {
    verdict: bigEnough && signAgrees ? "matched" : "missed",
    realizedMovePct: Math.round(realized * 100) / 100,
    impliedMovePct: Math.round(impliedMovePct * 100) / 100,
    impliedSource,
    reactionWindow,
    fromDate: from,
    toDate: to,
  };
}
