/**
 * Ingest: fetch catalysts from UW, load footprints through the cache, score,
 * verify and upsert. Shared by the Vercel cron route and `pnpm ingest`.
 * No Next.js imports here so it also runs under tsx.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SupabaseCache,
  UwClient,
  buildScoreInput,
  fetchCatalysts,
  loadOutcome,
} from "@foreshadow/uw";
import { loadTaggedCatalysts, tagMacroCatalysts } from "./tagger";
import {
  addTradingDays,
  computeVerdict,
  footprintWindow,
  partialFootprintWindow,
  reactionWindowFor,
  scoreBand,
  scoreEvent,
  todayIso,
  upcomingTradingDays,
  type Catalyst,
  type CatalystKind,
  type DailyFootprint,
  type IsoDate,
  type OhlcBar,
  type StoredScore,
  type VerdictResult,
} from "@foreshadow/core";

export type IngestMode = "radar" | "daily" | "backfill";

export interface IngestOptions {
  mode: IngestMode;
  today?: IsoDate;
  /** Calendar days of history for daily/backfill (default 90 / 365). */
  lookbackDays?: number;
  /** Trading days ahead for radar (default 10). */
  horizonDays?: number;
  /** Events scored per run; the rest wait for the next run. */
  maxEvents?: number;
  kinds?: CatalystKind[];
  /** Run the Claude catalyst tagger over POTUS + economic rows (default: all modes but backfill). */
  tagMacro?: boolean;
  log?: (msg: string) => void;
  /** Earnings below this market cap are skipped (default $2B). */
  minEarningsMarketCap?: number;
  /** Skip catalysts whose ticker has no listed options (default true). */
  requireOptions?: boolean;
  /** Count what would be scored, then stop: no UW footprint calls, no writes. */
  dryRun?: boolean;
  /** Events scored in parallel (default 1). */
  concurrency?: number;
  /** Called after each upsert, e.g. to dispatch alerts. */
  onScored?: (change: { prev: StoredScore | null; next: StoredScore; catalyst: Catalyst }) => Promise<void>;
}

export const DEFAULT_MIN_EARNINGS_MARKET_CAP = 2_000_000_000;

/**
 * The scoring universe. Every FDA event with listed options, and earnings for
 * companies above the market-cap floor with listed options. Congress, insider
 * and macro catalysts pass through (their volume is already small).
 */
function marketCapOf(c: Catalyst): number {
  const cap = Number(c.payload?.marketcap);
  return Number.isFinite(cap) ? cap : 0;
}

export function inUniverse(c: Catalyst, opts: { minEarningsMarketCap: number; requireOptions: boolean }): boolean {
  const p = c.payload ?? {};
  const hasOptions = p.has_options;
  if (opts.requireOptions && hasOptions === false) return false;
  if (c.kind === "earnings") {
    if (opts.requireOptions && hasOptions !== true) return false;
    const cap = typeof p.marketcap === "number" ? p.marketcap : Number(p.marketcap);
    return Number.isFinite(cap) && cap >= opts.minEarningsMarketCap;
  }
  return true;
}

export interface IngestReport {
  runId: number | null;
  mode: IngestMode;
  from: IsoDate;
  to: IsoDate;
  catalystsSeen: number;
  candidates: number;
  scored: number;
  requests: number | null;
  warnings: string[];
  errors: string[];
  durationMs: number;
}

const DEFAULT_KINDS: Record<IngestMode, CatalystKind[]> = {
  radar: ["fda", "earnings"],
  daily: ["fda", "earnings", "congress", "insider"],
  backfill: ["fda", "earnings", "congress", "insider"],
};

function isoDaysAgo(today: IsoDate, days: number): IsoDate {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function runIngest(db: SupabaseClient, uw: UwClient, opts: IngestOptions): Promise<IngestReport> {
  const started = Date.now();
  const log = opts.log ?? (() => {});
  const today = opts.today ?? todayIso();
  const mode = opts.mode;
  const kinds = opts.kinds ?? DEFAULT_KINDS[mode];
  const maxEvents = opts.maxEvents ?? (mode === "radar" ? 12 : 6);
  const warnings: string[] = [];
  const errors: string[] = [];

  let from: IsoDate;
  let to: IsoDate;
  if (mode === "radar") {
    const horizon = upcomingTradingDays(today, opts.horizonDays ?? 10);
    from = today;
    to = horizon[horizon.length - 1];
  } else {
    from = isoDaysAgo(today, opts.lookbackDays ?? (mode === "backfill" ? 365 : 90));
    to = today;
  }

  const { data: run } = opts.dryRun
    ? { data: null }
    : await db.from("ingest_runs").insert({ mode, status: "running" }).select("id").single();
  const runId = (run as { id: number } | null)?.id ?? null;
  const universe = {
    minEarningsMarketCap: opts.minEarningsMarketCap ?? DEFAULT_MIN_EARNINGS_MARKET_CAP,
    requireOptions: opts.requireOptions ?? true,
  };

  const cache = new SupabaseCache(db);
  let catalysts: Catalyst[] = [];
  let scored = 0;
  let candidates: Catalyst[] = [];
  try {
    const fetched = await fetchCatalysts(uw, { from, to, kinds });
    catalysts = fetched.filter((c) => inUniverse(c, universe));
    const byKind = (xs: Catalyst[]) =>
      Object.entries(xs.reduce<Record<string, number>>((m, c) => ((m[c.kind] = (m[c.kind] ?? 0) + 1), m), {}))
        .map(([k, n]) => `${k} ${n}`)
        .join(", ");
    log(`fetched ${fetched.length} catalysts ${from} → ${to}; ${catalysts.length} in universe (${byKind(catalysts)})`);
    if (!opts.dryRun) await upsertCatalysts(db, catalysts);
    if (!opts.dryRun && (opts.tagMacro ?? mode !== "backfill")) {
      try {
        await tagMacroCatalysts(db, uw, { today, log });
      } catch (err) {
        warnings.push(`tagger: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const tagged = await loadTaggedCatalysts(db, from, to);
    const seen = new Set(catalysts.map((c) => c.id));
    for (const c of tagged) if (!seen.has(c.id)) catalysts.push(c);

    const existing = await loadExistingScores(db, catalysts.map((c) => c.id));
    candidates = pickCandidates(catalysts, existing, mode, today).slice(0, maxEvents);
    const tickers = new Set(candidates.map((c) => c.ticker));
    log(`${candidates.length} to score (max ${maxEvents}) across ${tickers.size} tickers`);
    if (opts.dryRun) {
      log(`dry run: about ${tickers.size * 145 + candidates.length * 4} UW requests if every ticker is uncached`);
      return { runId, mode, from, to, catalystsSeen: catalysts.length, candidates: candidates.length, scored: 0, requests: uw.usage.dailyCount, warnings, errors, durationMs: Date.now() - started };
    }

    const queue = [...candidates];
    const workers = Array.from({ length: Math.max(1, opts.concurrency ?? 1) }, async () => {
      for (let catalyst = queue.shift(); catalyst; catalyst = queue.shift()) {
      try {
        const others = catalysts.filter(
          (c) => c.id !== catalyst.id && c.ticker === catalyst.ticker && footprintWindow(catalyst.eventDate).includes(c.eventDate),
        ).length;
        const { stored, footprintDays, ohlc, warnings: w } = await scoreCatalyst(uw, cache, catalyst, today, others);
        warnings.push(...w);
        await upsertScore(db, stored);
        await upsertFootprints(db, catalyst.ticker, footprintDays, ohlc);
        scored += 1;
        log(`${catalyst.ticker} ${catalyst.eventDate} → ${stored.score} ${stored.direction} ${stored.verdict}`);
        if (opts.onScored) await opts.onScored({ prev: existing.get(catalyst.id) ?? null, next: stored, catalyst });
      } catch (err) {
        const msg = `${catalyst.id}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        log(`error ${msg}`);
      }
      }
    });
    await Promise.all(workers);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  const report: IngestReport = {
    runId,
    mode,
    from,
    to,
    catalystsSeen: catalysts.length,
    candidates: candidates.length,
    scored,
    requests: uw.usage.dailyCount,
    warnings: [...new Set(warnings)].slice(0, 50),
    errors,
    durationMs: Date.now() - started,
  };
  if (runId !== null) {
    await db
      .from("ingest_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: errors.length && scored === 0 ? "error" : "ok",
        catalysts_seen: report.catalystsSeen,
        scored,
        requests: report.requests ?? 0,
        warnings: report.warnings,
        error: errors[0] ?? null,
      })
      .eq("id", runId);
  }
  return report;
}

function pickCandidates(catalysts: Catalyst[], existing: Map<string, StoredScore>, mode: IngestMode, today: IsoDate): Catalyst[] {
  if (mode === "radar") {
    // Only events whose five-day window has opened have anything to measure.
    // Never-scored first, then the stalest, biggest companies first, so
    // successive runs work through the whole list instead of the same few.
    const today0 = `${today}T00:00:00Z`;
    return catalysts
      .filter((c) => c.eventDate > today && partialFootprintWindow(c.eventDate, today).length > 0)
      .map((c) => {
        const s = existing.get(c.id);
        const fresh = s?.partialWindow && s.computedAt >= today0;
        return { c, rank: !s ? 0 : fresh ? 2 : 1, at: s?.computedAt ?? "", cap: marketCapOf(c) };
      })
      .sort((a, b) => a.rank - b.rank || a.at.localeCompare(b.at) || b.cap - a.cap || a.c.eventDate.localeCompare(b.c.eventDate))
      .map((x) => x.c);
  }
  const needs = (c: Catalyst) => {
    const s = existing.get(c.id);
    if (!s) return true;
    if (s.partialWindow && c.eventDate <= today) return true;
    if (s.verdict === "pending" && c.eventDate <= addTradingDays(today, -2)) return true;
    return false;
  };
  return catalysts.filter((c) => c.eventDate <= today && needs(c)).sort((a, b) => b.eventDate.localeCompare(a.eventDate));
}

export async function scoreCatalyst(
  uw: UwClient,
  cache: SupabaseCache,
  catalyst: Catalyst,
  today: IsoDate,
  otherCatalystsInWindow: number,
): Promise<{ stored: StoredScore; footprintDays: DailyFootprint[]; ohlc: OhlcBar[]; warnings: string[] }> {
  const upcoming = catalyst.eventDate > today;
  const { input, warnings } = await buildScoreInput(uw, cache, catalyst, { today, otherCatalystsInWindow });
  const result = scoreEvent(input);
  const outcome = await loadOutcome(uw, cache, catalyst, { today });
  warnings.push(...outcome.warnings);

  const rw = reactionWindowFor(catalyst.eventDate, catalyst.session);
  let verdict: VerdictResult = {
    verdict: "pending",
    realizedMovePct: null,
    impliedMovePct: outcome.impliedMovePct ?? null,
    impliedSource: outcome.impliedMovePct != null ? "uw" : "none",
    reactionWindow: rw.reactionWindow,
    fromDate: rw.from,
    toDate: rw.to,
  };
  if (!upcoming) {
    verdict = computeVerdict({
      eventDate: catalyst.eventDate,
      session: catalyst.session,
      direction: result.direction,
      ohlc: outcome.ohlc,
      impliedMovePct: outcome.impliedMovePct,
      today,
    });
  }

  const stored: StoredScore = {
    catalystId: catalyst.id,
    ticker: catalyst.ticker,
    eventDate: catalyst.eventDate,
    score: result.score,
    direction: result.direction,
    verdict: verdict.verdict,
    realizedMovePct: verdict.realizedMovePct,
    impliedMovePct: verdict.impliedMovePct,
    partialWindow: upcoming,
    flags: result.flags,
    breakdown: {
      signals: result.signals,
      directionScore: result.directionScore,
      topAlerts: result.topAlerts,
      verdict,
      band: scoreBand(result.score),
      daily: result.daily.filter((m) => m.date >= addTradingDays(catalyst.eventDate, -11)),
    },
    computedAt: new Date().toISOString(),
  };
  const windowDays = new Set(upcoming ? partialFootprintWindow(catalyst.eventDate, today) : footprintWindow(catalyst.eventDate));
  const footprintDays = input.footprintDays.filter((d) => windowDays.has(d.date));
  return { stored, footprintDays, ohlc: outcome.ohlc, warnings };
}

// ---------------------------------------------------------------------------
// Supabase writes
// ---------------------------------------------------------------------------

async function upsertCatalysts(db: SupabaseClient, catalysts: Catalyst[]) {
  for (let i = 0; i < catalysts.length; i += 200) {
    const rows = catalysts.slice(i, i + 200).map((c) => ({
      id: c.id,
      ticker: c.ticker,
      kind: c.kind,
      event_date: c.eventDate,
      session: c.session,
      title: c.title,
      source: c.source,
      payload: c.payload ?? {},
    }));
    const { error } = await db.from("catalysts").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`catalysts upsert: ${error.message}`);
  }
}

async function loadExistingScores(db: SupabaseClient, ids: string[]): Promise<Map<string, StoredScore>> {
  const out = new Map<string, StoredScore>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("scores").select("*").in("catalyst_id", ids.slice(i, i + 200));
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      out.set(String(r.catalyst_id), {
        catalystId: String(r.catalyst_id),
        ticker: String(r.ticker),
        eventDate: String(r.event_date),
        score: Number(r.score),
        direction: r.direction as StoredScore["direction"],
        verdict: r.verdict as StoredScore["verdict"],
        realizedMovePct: r.realized_move_pct === null ? null : Number(r.realized_move_pct),
        impliedMovePct: r.implied_move_pct === null ? null : Number(r.implied_move_pct),
        partialWindow: Boolean(r.partial_window),
        flags: r.flags as StoredScore["flags"],
        breakdown: r.breakdown as StoredScore["breakdown"],
        computedAt: String(r.computed_at),
      });
    }
  }
  return out;
}

async function upsertScore(db: SupabaseClient, s: StoredScore) {
  const { error } = await db.from("scores").upsert(
    {
      catalyst_id: s.catalystId,
      ticker: s.ticker,
      event_date: s.eventDate,
      score: s.score,
      direction: s.direction,
      verdict: s.verdict,
      realized_move_pct: s.realizedMovePct,
      implied_move_pct: s.impliedMovePct,
      partial_window: s.partialWindow,
      flags: s.flags,
      breakdown: s.breakdown,
      computed_at: s.computedAt,
    },
    { onConflict: "catalyst_id" },
  );
  if (error) throw new Error(`scores upsert: ${error.message}`);
}

async function upsertFootprints(db: SupabaseClient, ticker: string, days: DailyFootprint[], ohlc: OhlcBar[]) {
  const rows = [
    ...days.map((d) => ({ ticker, trade_date: d.date, endpoint: "daily", payload: d })),
    ...ohlc.map((b) => ({ ticker, trade_date: b.date, endpoint: "ohlc", payload: b })),
  ];
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from("footprints").upsert(rows.slice(i, i + 200), { onConflict: "ticker,trade_date,endpoint" });
    if (error) throw new Error(`footprints upsert: ${error.message}`);
  }
}
