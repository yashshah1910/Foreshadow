/**
 * The three Foreshadow tools, shared by the remote MCP server, the REST
 * endpoints the stdio wrapper proxies to, and the in-app investigator.
 * Pure reads over the data layer; no UW calls. They return Foreshadow's
 * results (score, lean, measurements, verdict, totals and a few of the largest
 * trades as examples), never raw Unusual Whales rows or ids.
 */

import { API_SAMPLE_SIZE, getDataSource, sampleTrades, tradeTotals } from "@/lib/data";
import type { EventSummary } from "@/lib/data";

function summarize(s: EventSummary) {
  return {
    id: s.catalyst.id,
    ticker: s.catalyst.ticker,
    kind: s.catalyst.kind,
    eventDate: s.catalyst.eventDate,
    session: s.catalyst.session,
    title: s.catalyst.title,
    score: s.score,
    band: s.band,
    direction: s.direction,
    verdict: s.verdict,
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
  const pick =
    exact[0] ??
    [...dossier.events].sort(
      (a, b) =>
        Math.abs(Date.parse(a.catalyst.eventDate) - Date.parse(args.eventDate)) -
        Math.abs(Date.parse(b.catalyst.eventDate) - Date.parse(args.eventDate)),
    )[0];
  if (!pick) return { error: `No catalyst for ${ticker} near ${args.eventDate}` };
  const detail = await ds.getEvent(pick.catalyst.id);
  if (!detail) return { error: "Event not found" };
  const all = detail.footprint.flatMap((d) => d.alerts);
  const totals = tradeTotals(all);
  return {
    ...summarize(pick),
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

export const foreshadowTools = {
  foreshadow_score: foreshadowScore,
  foreshadow_radar: foreshadowRadar,
  foreshadow_history: foreshadowHistory,
};
