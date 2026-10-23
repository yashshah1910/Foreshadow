/**
 * The Foreshadow tools, shared by the remote MCP server, the REST
 * endpoints the stdio wrapper proxies to, and the in-app investigator.
 * Pure reads over the data layer; no UW calls. They return Foreshadow's
 * results (score, lean, measurements, verdict, totals and a few of the largest
 * trades as examples), never raw Unusual Whales rows or ids.
 */

import { API_SAMPLE_SIZE, getDataSource, getScorecard, sampleTrades, tradeTotals } from "@/lib/data";
import type { EventSummary } from "@/lib/data";
import { OUTCOME_PLAIN, outcomeOf, scorecardFinding } from "@/lib/plain";
import { similarCases } from "@/lib/similar";
import { percentBelow } from "@/lib/rank";
import { windowBets } from "@foreshadow/core";

/** A date close enough to mean the same news: a typo or a timezone slip, not a different quarter. */
const NEAREST_DAYS = 10;

function nearest(events: EventSummary[], date: string): EventSummary | undefined {
  const at = Date.parse(date);
  const dist = (e: EventSummary) => Math.abs(Date.parse(e.catalyst.eventDate) - at) / 86_400_000;
  return [...events].filter((e) => dist(e) <= NEAREST_DAYS).sort((a, b) => dist(a) - dist(b))[0];
}

function summarize(s: EventSummary) {
  return {
    id: s.catalyst.id,
    ticker: s.catalyst.ticker,
    kind: s.catalyst.kind,
    eventDate: s.catalyst.eventDate,
    session: s.catalyst.session,
    title: s.catalyst.title,
    // Whole numbers, as the site shows them.
    score: Math.round(s.score),
    band: s.band,
    direction: s.direction,
    verdict: s.verdict,
    // The verdict in the site's three outcomes, in words: right / right way but a smaller move / wrong way.
    result: OUTCOME_PLAIN[outcomeOf(s)],
    impliedMovePct: s.impliedMovePct,
    realizedMovePct: s.realizedMovePct,
    partialWindow: s.partialWindow,
    flags: s.flags,
  };
}

export async function foreshadowScore(args: { ticker: string; eventDate: string }) {
  const ds = getDataSource();
  const ticker = args.ticker.trim().toUpperCase();
  const dossier = await ds.getTickerDossier(ticker);
  if (!dossier) return { error: `No scored catalysts for ${ticker}` };
  const exact = dossier.events.filter((e) => e.catalyst.eventDate === args.eventDate);
  const pick = exact[0] ?? nearest(dossier.events, args.eventDate);
  if (!pick) return { error: `No scored news for ${ticker} within ${NEAREST_DAYS} days of ${args.eventDate}` };
  const detail = await ds.getEvent(pick.catalyst.id);
  if (!detail) return { error: "Event not found" };
  const all = detail.footprint.flatMap((d) => d.alerts);
  const totals = tradeTotals(all);
  const money = detail.stored.breakdown.signals.find((s) => s.key === "directionalPremium")?.detail ?? {};
  const kindScores = (await getScorecard()).kinds.find((k) => k.kind === pick.catalyst.kind)?.scores ?? [];
  return {
    ...summarize(pick),
    // Where the score sits among finished cases of the same kind of news.
    rank: kindScores.length
      ? { busierThanPct: percentBelow(pick.score, kindScores), outOf: kindScores.length, among: `finished ${pick.catalyst.kind} cases` }
      : undefined,
    // Bets are calls and puts bought at the asking price; trades sold at the bid are reported apart.
    money: (() => {
      const b = windowBets(money);
      return { betsOnRise: b.rise, betsOnFall: b.fall, bothSides: b.rise + b.fall, soldOrUnclear: Math.max(0, b.traded - b.rise - b.fall) };
    })(),
    note: exact[0] ? undefined : `No catalyst exactly on ${args.eventDate}; returning the nearest one.`,
    url: `/event/${encodeURIComponent(pick.catalyst.id)}`,
    signals: detail.stored.breakdown.signals.map((s) => ({
      key: s.key,
      label: s.label,
      weight: s.weight,
      z: s.z,
      contribution: s.contribution,
      footprintValue: s.footprintValue,
      baselineMean: s.baselineMean,
      detail: s.detail,
    })),
    trades: { count: totals.count, totalPremium: totals.premium, largest: sampleTrades(all, API_SAMPLE_SIZE) },
    verdictDetail: detail.stored.breakdown.verdict,
  };
}

export async function foreshadowRadar(args: { daysAhead?: number; minScore?: number }) {
  const ds = getDataSource();
  const items = await ds.getRadar({ daysAhead: args.daysAhead ?? 10, minScore: args.minScore });
  return {
    today: await ds.today(),
    items: items.map((i) => ({
      ...summarize(i),
      windowStart: i.windowStart,
      windowOpen: i.windowOpen,
      daysElapsed: i.daysElapsed,
      daysTotal: i.daysTotal,
    })),
  };
}

export async function foreshadowHistory(args: { ticker: string }) {
  const ds = getDataSource();
  const dossier = await ds.getTickerDossier(args.ticker.trim().toUpperCase());
  if (!dossier) return { error: `No scored catalysts for ${args.ticker.toUpperCase()}` };
  return {
    ticker: dossier.ticker,
    company: dossier.company,
    hitRate: dossier.hitRate,
    events: dossier.events.map(summarize),
  };
}

const GROUP_NOUN = { readout: "FDA decisions and trial readouts", update: "routine FDA updates" } as const;

export async function foreshadowScorecard() {
  const card = await getDataSource().getScorecard();
  return {
    cases: card.cases,
    definition:
      "The bets were right when the stock moved at least as much as options priced in, in the direction the bets leaned. rightPct counts only cases where the bets leaned (leanedCases). The 0-19 band is ordinary betting, the yardstick; findings claim a lift only past a one-sided two-sample test (z >= 1.65).",
    kinds: card.kinds.map((k) => ({
      kind: k.kind,
      cases: k.cases,
      finding: scorecardFinding(k.kind, k.bands),
      bands: k.bands.map((b) => ({
        scores: b.label,
        cases: b.cases,
        leanedCases: b.leaned,
        rightPct: b.leaned ? Math.round((b.right / b.leaned) * 100) : null,
        movedMoreThanExpectedPct: b.cases ? Math.round((b.movedMore / b.cases) * 100) : null,
        movedWithLeanPct: b.leaned ? Math.round((b.leanedRight / b.leaned) * 100) : null,
      })),
      // FDA only: the same test within decisions and readouts, and within routine updates.
      groups: k.groups?.map((g) => ({
        group: g.label,
        cases: g.cases,
        finding: scorecardFinding(k.kind, g.bands, GROUP_NOUN[g.key]),
      })),
    })),
  };
}

export async function foreshadowSimilar(args: { ticker: string; eventDate: string }) {
  const ds = getDataSource();
  const ticker = args.ticker.trim().toUpperCase();
  const dossier = await ds.getTickerDossier(ticker);
  const target = dossier?.events.find((e) => e.catalyst.eventDate === args.eventDate) ?? nearest(dossier?.events ?? [], args.eventDate);
  if (!target) return { error: `No scored news for ${ticker} within ${NEAREST_DAYS} days of ${args.eventDate}` };
  const pool = await ds.getLeaderboard({ kind: target.catalyst.kind, limit: 400 });
  const sim = similarCases(target, pool);
  return {
    case: summarize(target),
    matchedOn: { kind: target.catalyst.kind, lean: target.direction, scoreRange: [sim.lo, sim.hi] },
    similarCases: sim.cases.length,
    betsRight: sim.right,
    rightPct: sim.cases.length ? Math.round((sim.right / sim.cases.length) * 100) : null,
    // Looser: the stock moved the way the bets leaned, whatever the size of the move.
    movedTheirWay: sim.wentTheirWay,
    movedTheirWayPct: sim.cases.length ? Math.round((sim.wentTheirWay / sim.cases.length) * 100) : null,
    closest: sim.cases.slice(0, 8).map(summarize),
  };
}

export const foreshadowTools = {
  foreshadow_score: foreshadowScore,
  foreshadow_radar: foreshadowRadar,
  foreshadow_history: foreshadowHistory,
  foreshadow_scorecard: foreshadowScorecard,
  foreshadow_similar: foreshadowSimilar,
};
