import { cache } from "react";
import { dataMode } from "@/lib/env";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { FixtureDataSource } from "./fixtures";
import { SupabaseDataSource } from "./supabase";
import type { DataSource, LeaderboardFilters } from "./types";

export type * from "./types";

let source: DataSource | null = null;

export function getDataSource(): DataSource {
  if (source) return source;
  source = dataMode() === "supabase" ? new SupabaseDataSource(createSupabaseDataClient()) : new FixtureDataSource();
  return source;
}

// Per-request memoized readers for Server Components.
export const getStats = cache(() => getDataSource().getStats());
export const getToday = cache(() => getDataSource().today());
export const getLeaderboard = cache((filters?: LeaderboardFilters) => getDataSource().getLeaderboard(filters));
export const getEvent = cache((id: string) => getDataSource().getEvent(id));
export const getTickerDossier = cache((ticker: string) => getDataSource().getTickerDossier(ticker));
export const getRadar = cache((daysAhead?: number, minScore?: number) =>
  getDataSource().getRadar({ daysAhead, minScore }),
);
export const getCompany = cache((ticker: string) => getDataSource().getCompany(ticker));
