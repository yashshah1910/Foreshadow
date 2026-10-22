import { cache } from "react";
import { unstable_cache } from "next/cache";
import { dataMode } from "@/lib/env";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { FixtureDataSource } from "./fixtures";
import { SupabaseDataSource } from "./supabase";
import { CASE_SAMPLE_SIZE, sampleTrades, tradeTotals } from "./sample";
import type { DataSource, EventDetail, LeaderboardFilters } from "./types";

export type * from "./types";
export { API_SAMPLE_SIZE, CASE_SAMPLE_SIZE, sampleTrades, tradeTotals } from "./sample";

let source: DataSource | null = null;

export function getDataSource(): DataSource {
  if (source) return source;
  source = dataMode() === "supabase" ? new SupabaseDataSource(createSupabaseDataClient()) : new FixtureDataSource();
  return source;
}

/**
 * Supabase reads are slow enough (hundreds of score rows with their daily
 * breakdowns) that every click waited on them. Share results across requests
 * for a few minutes; scores only change when the ingest runs. Fixture mode is
 * already in memory. The radar is cached for a minute only: it updates live,
 * and Coming up says when it was last scored.
 */
function shared<A extends unknown[], R>(key: string, seconds: number, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  if (dataMode() !== "supabase") return fn;
  return unstable_cache(fn, ["foreshadow-data", key], { revalidate: seconds, tags: ["foreshadow-data"] });
}

const sharedStats = shared("stats", 120, () => getDataSource().getStats());
const sharedLeaderboard = shared("leaderboard", 120, (filters?: LeaderboardFilters) => getDataSource().getLeaderboard(filters));
const sharedEvent = shared("event", 300, async (id: string) => slimEvent(await getDataSource().getEvent(id)));

/**
 * Keep pages (and the cache entry) small and free of raw UW rows: a handful of
 * the largest trades as examples, plus totals over all of them.
 */
function slimEvent(ev: EventDetail | null): EventDetail | null {
  if (!ev) return ev;
  const all = ev.footprint.flatMap((d) => d.alerts);
  return {
    ...ev,
    alertStats: tradeTotals(all),
    sampleTrades: sampleTrades(all, CASE_SAMPLE_SIZE),
    footprint: [],
  };
}
const sharedScorecard = shared("scorecard", 300, () => getDataSource().getScorecard());
const sharedDossier = shared("dossier", 300, (ticker: string) => getDataSource().getTickerDossier(ticker));

// Per-request memoized readers for Server Components.
export const getStats = cache(() => sharedStats());
export const getToday = cache(() => getDataSource().today());
export const getLeaderboard = cache((filters?: LeaderboardFilters) => sharedLeaderboard(filters));
export const getEvent = cache((id: string) => sharedEvent(id));
export const getTickerDossier = cache((ticker: string) => sharedDossier(ticker.toUpperCase()));
const sharedRadar = shared("radar", 60, (daysAhead?: number, minScore?: number) => getDataSource().getRadar({ daysAhead, minScore }));
export const getRadar = cache((daysAhead?: number, minScore?: number) => sharedRadar(daysAhead, minScore));
export const getScorecard = cache(() => sharedScorecard());
export const getCompany = cache((ticker: string) => getDataSource().getCompany(ticker));
