import { cache } from "react";
import { unstable_cache } from "next/cache";
import { dataMode } from "@/lib/env";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { FixtureDataSource } from "./fixtures";
import { SupabaseDataSource } from "./supabase";
import type { DataSource, EventDetail, LeaderboardFilters } from "./types";

export type * from "./types";

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
 * already in memory. The radar stays uncached because it updates live.
 */
function shared<A extends unknown[], R>(key: string, seconds: number, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  if (dataMode() !== "supabase") return fn;
  return unstable_cache(fn, ["foreshadow-data", key], { revalidate: seconds, tags: ["foreshadow-data"] });
}

const sharedStats = shared("stats", 120, () => getDataSource().getStats());
const sharedLeaderboard = shared("leaderboard", 120, (filters?: LeaderboardFilters) => getDataSource().getLeaderboard(filters));
const sharedEvent = shared("event", 300, async (id: string) => slimEvent(await getDataSource().getEvent(id)));

/** Keep pages (and the cache entry) small: the largest trades plus totals. */
function slimEvent(ev: EventDetail | null, keep = 60): EventDetail | null {
  if (!ev) return ev;
  const all = ev.footprint.flatMap((d) => d.alerts);
  const top = new Set([...all].sort((a, b) => b.premium - a.premium).slice(0, keep).map((a) => a.id));
  return {
    ...ev,
    alertStats: { count: all.length, premium: all.reduce((sum, a) => sum + a.premium, 0) },
    footprint: ev.footprint.map((d) => ({ ...d, alerts: d.alerts.filter((a) => top.has(a.id)), oiChanges: [], darkPool: [] })),
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
export const getRadar = cache((daysAhead?: number, minScore?: number) =>
  getDataSource().getRadar({ daysAhead, minScore }),
);
export const getScorecard = cache(() => sharedScorecard());
export const getCompany = cache((ticker: string) => getDataSource().getCompany(ticker));
