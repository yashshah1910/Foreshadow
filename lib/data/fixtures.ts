/**
 * Demo-mode data source: reads the generated JSON fixtures under
 * supabase/fixtures. Read-only, cached in memory for the process lifetime.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  chartWindow,
  footprintWindow,
  partialFootprintWindow,
  upcomingTradingDays,
  type Catalyst,
  type DailyFootprint,
  type IsoDate,
  type OhlcBar,
  type StoredScore,
} from "@foreshadow/core";
import type {
  Company,
  DataSource,
  Dossier,
  EventDetail,
  EventSummary,
  LeaderboardFilters,
  Narration,
  RadarItem,
  Stats,
} from "./types";
import { applyLeaderboardFilters, hitRate, pastCounts, sortRadar, toRadarItem, toSummary } from "./shared";

interface Meta {
  today: IsoDate;
  generatedAt: string;
  seed: number;
  synthetic: boolean;
  heroCatalystId: string;
  counts: { catalysts: number; tickers: number };
}

const FIXTURES_DIR = path.join(process.cwd(), "supabase", "fixtures");
const jsonCache = new Map<string, Promise<unknown>>();

function loadJson<T>(rel: string): Promise<T> {
  let p = jsonCache.get(rel);
  if (!p) {
    p = readFile(path.join(FIXTURES_DIR, rel), "utf8").then((s) => JSON.parse(s) as unknown);
    jsonCache.set(rel, p);
  }
  return p as Promise<T>;
}

async function loadOptionalJson<T>(rel: string): Promise<T | null> {
  try {
    return await loadJson<T>(rel);
  } catch {
    return null;
  }
}

const narrations = new Map<string, Narration>();

export class FixtureDataSource implements DataSource {
  readonly mode = "demo" as const;

  private async meta() {
    return loadJson<Meta>("meta.json");
  }
  private async catalysts() {
    return loadJson<Catalyst[]>("catalysts.json");
  }
  private async scores() {
    return loadJson<StoredScore[]>("scores.json");
  }
  private async companies() {
    return loadJson<Company[]>("companies.json");
  }

  private async summaries(): Promise<EventSummary[]> {
    const [scores, catalysts, companies] = await Promise.all([this.scores(), this.catalysts(), this.companies()]);
    const byId = new Map(catalysts.map((c) => [c.id, c]));
    const byTicker = new Map(companies.map((c) => [c.ticker, c]));
    const out: EventSummary[] = [];
    for (const s of scores) {
      const c = byId.get(s.catalystId);
      if (c) out.push(toSummary(s, c, byTicker.get(s.ticker) ?? null));
    }
    return out;
  }

  async today() {
    return (await this.meta()).today;
  }

  async getStats(): Promise<Stats> {
    const [meta, scores, rows] = await Promise.all([this.meta(), this.scores(), this.summaries()]);
    const last = scores.reduce<string | null>((m, s) => (m === null || s.computedAt > m ? s.computedAt : m), null);
    return {
      mode: "demo",
      today: meta.today,
      synthetic: meta.synthetic,
      events: scores.length,
      tickers: meta.counts.tickers,
      lastComputedAt: last,
      heroCatalystId: meta.heroCatalystId,
      past: pastCounts(rows, meta.today),
    };
  }

  async getLeaderboard(filters: LeaderboardFilters = {}) {
    const [rows, today] = await Promise.all([this.summaries(), this.today()]);
    return applyLeaderboardFilters(rows, filters, today);
  }

  async getEvent(id: string): Promise<EventDetail | null> {
    const [scores, catalysts, companies, today] = await Promise.all([
      this.scores(),
      this.catalysts(),
      this.companies(),
      this.today(),
    ]);
    const stored = scores.find((s) => s.catalystId === id);
    const catalyst = catalysts.find((c) => c.id === id);
    if (!stored || !catalyst) return null;
    const company = companies.find((c) => c.ticker === catalyst.ticker) ?? null;
    const windowDays = stored.partialWindow
      ? partialFootprintWindow(catalyst.eventDate, today)
      : footprintWindow(catalyst.eventDate);
    const [fpFile, bars] = await Promise.all([
      loadOptionalJson<{ ticker: string; days: DailyFootprint[] }>(`footprints/${catalyst.ticker}.json`),
      loadOptionalJson<OhlcBar[]>(`ohlc/${catalyst.ticker}.json`),
    ]);
    const want = new Set(windowDays);
    const footprint = (fpFile?.days ?? []).filter((d) => want.has(d.date));
    const chartDays = new Set(chartWindow(catalyst.eventDate).filter((d) => d <= today));
    const chartBars = (bars ?? []).filter((b) => chartDays.has(b.date));
    const related = (await this.summaries())
      .filter((s) => s.catalyst.ticker === catalyst.ticker && s.catalyst.id !== id)
      .sort((a, b) => b.catalyst.eventDate.localeCompare(a.catalyst.eventDate));
    return {
      summary: toSummary(stored, catalyst, company),
      stored,
      footprint,
      windowDays,
      chartBars,
      narration: narrations.get(`${id}:${stored.score}`) ?? null,
      related,
    };
  }

  async getTickerDossier(ticker: string): Promise<Dossier | null> {
    const t = ticker.toUpperCase();
    const [rows, companies] = await Promise.all([this.summaries(), this.companies()]);
    const events = rows
      .filter((s) => s.catalyst.ticker === t)
      .sort((a, b) => b.catalyst.eventDate.localeCompare(a.catalyst.eventDate));
    const company = companies.find((c) => c.ticker === t) ?? null;
    if (events.length === 0 && !company) return null;
    return { ticker: t, company, events, hitRate: hitRate(events) };
  }

  async getRadar(opts: { daysAhead?: number; minScore?: number } = {}): Promise<RadarItem[]> {
    const [rows, today] = await Promise.all([this.summaries(), this.today()]);
    const horizon = upcomingTradingDays(today, opts.daysAhead ?? 10);
    const last = horizon[horizon.length - 1];
    const items = rows
      .filter((s) => s.partialWindow && s.catalyst.eventDate > today && s.catalyst.eventDate <= last)
      .map((s) => toRadarItem(s, today))
      .filter((s) => opts.minScore === undefined || !s.windowOpen || s.score >= opts.minScore);
    return sortRadar(items);
  }

  async searchTickers(query: string): Promise<Company[]> {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    const companies = await this.companies();
    return companies
      .filter((c) => c.ticker.startsWith(q) || c.name.toUpperCase().includes(q))
      .slice(0, 8);
  }

  async getNarration(catalystId: string, score: number) {
    return narrations.get(`${catalystId}:${score}`) ?? null;
  }

  async saveNarration(catalystId: string, score: number, narration: Narration) {
    narrations.set(`${catalystId}:${score}`, narration);
  }

  async getCompany(ticker: string) {
    const companies = await this.companies();
    return companies.find((c) => c.ticker === ticker.toUpperCase()) ?? null;
  }
}
