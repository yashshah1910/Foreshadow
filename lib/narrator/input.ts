import type { EventDetail, Dossier } from "@/lib/data";
import type { DossierInput, NarrationInput } from "@foreshadow/narrator";

/** Project an EventDetail onto the narrow, serializable shape the narrator reads. */
export function toNarrationInput(ev: EventDetail): NarrationInput {
  const { summary: s, stored } = ev;
  return {
    ticker: s.catalyst.ticker,
    eventDate: s.catalyst.eventDate,
    eventTitle: s.catalyst.title,
    kind: s.catalyst.kind,
    session: s.catalyst.session,
    score: s.score,
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
    topAlerts: stored.breakdown.topAlerts.map((a) => ({
      executedAt: a.executedAt,
      type: a.type,
      strike: a.strike,
      expiry: a.expiry,
      premium: a.premium,
      size: a.size,
      side: a.side,
      isSweep: a.isSweep,
      underlyingPrice: a.underlyingPrice,
    })),
    verdict: s.partialWindow
      ? undefined
      : {
          verdict: s.verdict,
          realizedMovePct: s.realizedMovePct,
          impliedMovePct: s.impliedMovePct,
          reactionWindow: stored.breakdown.verdict.reactionWindow,
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
      score: e.score,
      direction: e.direction,
      verdict: e.verdict,
      realizedMovePct: e.realizedMovePct,
    })),
    hitRate: { scored: d.hitRate.scored, strong: d.hitRate.strong, matched: d.hitRate.strongMatched },
  };
}
