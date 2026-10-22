import { toTradeExample } from "@foreshadow/core";
import type { EventDetail, Dossier } from "@/lib/data";
import type { DossierInput, NarrationInput } from "@foreshadow/narrator";
import { outcomeOf, type Outcome } from "@/lib/plain";

const NARRATION_OUTCOME: Record<Outcome, "right" | "right way, small move" | "wrong way" | "no clear side" | undefined> = {
  right: "right",
  rightWay: "right way, small move",
  wrongWay: "wrong way",
  noLean: "no clear side",
  pending: undefined,
  none: undefined,
};

/** Project an EventDetail onto the narrow, serializable shape the narrator reads. */
export function toNarrationInput(ev: EventDetail): NarrationInput {
  const { summary: s, stored } = ev;
  return {
    ticker: s.catalyst.ticker,
    eventDate: s.catalyst.eventDate,
    eventTitle: s.catalyst.title,
    kind: s.catalyst.kind,
    session: s.catalyst.session,
    // Rounded the way the page shows them, so the story never says 70.5 beside a 71.
    score: Math.round(s.score),
    direction: s.direction,
    band: s.band,
    signals: stored.breakdown.signals.map((x) => ({
      key: x.key,
      label: x.label,
      weight: x.weight,
      z: x.z,
      contribution: x.contribution,
      footprintValue: x.footprintValue,
      baselineMean: x.baselineMean,
      detail: x.detail,
    })),
    topAlerts: stored.breakdown.topAlerts.map((a) => {
      // Amounts to three significant figures, as the page shows them ($983K, not $982,980).
      const t = { ...toTradeExample(a), premium: Number(toTradeExample(a).premium.toPrecision(3)) };
      // Counted here so the story never counts days itself: windowDays ends the trading day before the news.
      const i = ev.windowDays.indexOf(t.tradeDate);
      return i >= 0 ? { ...t, tradingDaysBefore: ev.windowDays.length - i } : t;
    }),
    verdict: s.partialWindow
      ? undefined
      : {
          verdict: s.verdict,
          realizedMovePct: s.realizedMovePct === null ? null : round1(s.realizedMovePct),
          impliedMovePct: s.impliedMovePct === null ? null : round1(s.impliedMovePct),
          reactionWindow: stored.breakdown.verdict.reactionWindow,
          outcome: NARRATION_OUTCOME[outcomeOf(s)],
        },
    flags: {
      insufficientHistory: s.flags.insufficientHistory,
      multiCatalyst: s.flags.multiCatalyst,
      partialWindow: s.flags.partialWindow,
      isIndexOrEtf: s.flags.isIndexOrEtf,
    },
  };
}

export function toDossierInput(d: Dossier, limit = 8): DossierInput {
  const past = d.events.filter((e) => !e.partialWindow).slice(0, limit);
  return {
    ticker: d.ticker,
    events: past.map((e) => ({
      eventDate: e.catalyst.eventDate,
      kind: e.catalyst.kind,
      title: e.catalyst.title,
      score: Math.round(e.score),
      direction: e.direction,
      verdict: e.verdict,
      realizedMovePct: e.realizedMovePct === null ? null : round1(e.realizedMovePct),
      outcome: NARRATION_OUTCOME[outcomeOf(e)],
    })),
    hitRate: { scored: d.hitRate.scored, strong: d.hitRate.strong, matched: d.hitRate.strongMatched },
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
