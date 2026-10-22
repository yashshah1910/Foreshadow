/**
 * Supabase-backed data source. Reads use the service-role client when
 * available (footprints are not readable anonymously), otherwise the anon key.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chartWindow,
  footprintWindow,
  partialFootprintWindow,
  todayIso,
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
import {
  applyLeaderboardFilters,
  companyFromCatalyst,
  hitRate,
  isoDaysAgo,
  sortRadar,
  toRadarItem,
  toSummary,
} from "./shared";

interface CatalystRow {
  id: string;
  ticker: string;
  kind: Catalyst["kind"];
  event_date: string;
  session: Catalyst["session"];
  title: string;
  source: string;
  payload: Record<string, unknown> | null;
}

interface ScoreRow {
  catalyst_id: string;
  ticker: string;
  event_date: string;
  score: number | string;
  direction: StoredScore["direction"];
  verdict: StoredScore["verdict"];
  realized_move_pct: number | string | null;
  implied_move_pct: number | string | null;
  partial_window: boolean;
  flags: StoredScore["flags"];
  breakdown: StoredScore["breakdown"];
  computed_at: string;
  catalysts?: CatalystRow | CatalystRow[] | null;
}

interface NarrationRow {
  story: string;
  caption: string;
  model: string;
  numbers_verified: boolean;
  created_at: string;
}

function num(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function rowToCatalyst(r: CatalystRow): Catalyst {
  return {
    id: r.id,
    ticker: r.ticker,
    kind: r.kind,
    eventDate: r.event_date,
    session: r.session,
    title: r.title,
    source: r.source,
    payload: r.payload ?? {},
  };
}

export function rowToStored(r: ScoreRow): StoredScore {
  return {
    catalystId: r.catalyst_id,
    ticker: r.ticker,
    eventDate: r.event_date,
    score: num(r.score) ?? 0,
    direction: r.direction,
    verdict: r.verdict,
    realizedMovePct: num(r.realized_move_pct),
    impliedMovePct: num(r.implied_move_pct),
    partialWindow: r.partial_window,
    flags: r.flags,
    breakdown: r.breakdown,
    computedAt: r.computed_at,
  };
}

function joinedCatalyst(r: ScoreRow): Catalyst | null {
  const c = Array.isArray(r.catalysts) ? r.catalysts[0] : r.catalysts;
  return c ? rowToCatalyst(c) : null;
}

export class SupabaseDataSource implements DataSource {
  readonly mode = "supabase" as const;

  constructor(private readonly db: SupabaseClient) {}

  async today(): Promise<IsoDate> {
    return todayIso();
  }

  private summaryOf(r: ScoreRow): EventSummary | null {
    const c = joinedCatalyst(r);
    if (!c) return null;
    return toSummary(rowToStored(r), c, companyFromCatalyst(c));
  }

  async getStats(): Promise<Stats> {
    const [{ count: events }, { data: last }, { data: tickers }] = await Promise.all([
      this.db.from("scores").select("catalyst_id", { count: "exact", head: true }),
      this.db.from("scores").select("computed_at").order("computed_at", { ascending: false }).limit(1),
      this.db.from("scores").select("ticker"),
    ]);
    return {
      mode: "supabase",
      today: todayIso(),
      synthetic: false,
      events: events ?? 0,
      tickers: new Set((tickers ?? []).map((t: { ticker: string }) => t.ticker)).size,
      lastComputedAt: last?.[0]?.computed_at ?? null,
      heroCatalystId: null,
    };
  }

  async getLeaderboard(filters: LeaderboardFilters = {}): Promise<EventSummary[]> {
    const today = todayIso();
    const since = isoDaysAgo(today, filters.days ?? 90);
    let q = this.db
      .from("scores")
      .select("*, catalysts!inner(*)")
      .eq("partial_window", false)
      .gte("event_date", since)
      .lte("event_date", today)
      .in("verdict", ["matched", "missed"])
      .order("score", { ascending: false })
      .limit(400);
    if (filters.kind && filters.kind !== "all") q = q.eq("catalysts.kind", filters.kind);
    const { data, error } = await q;
    if (error) throw error;
    const rows = ((data ?? []) as ScoreRow[]).map((r) => this.summaryOf(r)).filter((s): s is EventSummary => s !== null);
    return applyLeaderboardFilters(rows, filters, today);
  }

  async getEvent(id: string): Promise<EventDetail | null> {
    const { data, error } = await this.db.from("scores").select("*, catalysts!inner(*)").eq("catalyst_id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as ScoreRow;
    const catalyst = joinedCatalyst(row);
    if (!catalyst) return null;
    const stored = rowToStored(row);
    const today = todayIso();
    const windowDays = stored.partialWindow
      ? partialFootprintWindow(catalyst.eventDate, today)
      : footprintWindow(catalyst.eventDate);
    const chartDays = chartWindow(catalyst.eventDate).filter((d) => d <= today);
    const [fp, bars, narration, related] = await Promise.all([
      this.db
        .from("footprints")
        .select("trade_date, payload")
        .eq("ticker", catalyst.ticker)
        .eq("endpoint", "daily")
        .in("trade_date", windowDays),
      chartDays.length
        ? this.db
            .from("footprints")
            .select("trade_date, payload")
            .eq("ticker", catalyst.ticker)
            .eq("endpoint", "ohlc")
            .gte("trade_date", chartDays[0])
            .lte("trade_date", chartDays[chartDays.length - 1])
            .order("trade_date")
        : Promise.resolve({ data: [] as { trade_date: string; payload: unknown }[] }),
      this.getNarration(id, stored.score),
      this.db
        .from("scores")
        .select("*, catalysts!inner(*)")
        .eq("ticker", catalyst.ticker)
        .neq("catalyst_id", id)
        .order("event_date", { ascending: false })
        .limit(24),
    ]);
    const footprint = ((fp.data ?? []) as { trade_date: string; payload: DailyFootprint }[])
      .map((r) => r.payload)
      .sort((a, b) => a.date.localeCompare(b.date));
    const chartBars = ((bars.data ?? []) as { trade_date: string; payload: OhlcBar }[]).map((r) => r.payload);
    const relatedRows = ((related.data ?? []) as ScoreRow[]).map((r) => this.summaryOf(r)).filter((s): s is EventSummary => s !== null);
    return {
      summary: toSummary(stored, catalyst, companyFromCatalyst(catalyst)),
      stored,
      footprint,
      windowDays,
      chartBars,
      narration,
      related: relatedRows,
    };
  }

  async getTickerDossier(ticker: string): Promise<Dossier | null> {
    const t = ticker.toUpperCase();
    const { data, error } = await this.db
      .from("scores")
      .select("*, catalysts!inner(*)")
      .eq("ticker", t)
      .order("event_date", { ascending: false })
      .limit(60);
    if (error) throw error;
    const events = ((data ?? []) as ScoreRow[]).map((r) => this.summaryOf(r)).filter((s): s is EventSummary => s !== null);
    if (events.length === 0) return null;
    const company = events.map((e) => e.company).find((c): c is Company => c !== null) ?? null;
    return { ticker: t, company, events, hitRate: hitRate(events) };
  }

  async getRadar(opts: { daysAhead?: number; minScore?: number } = {}): Promise<RadarItem[]> {
    const today = todayIso();
    const horizon = upcomingTradingDays(today, opts.daysAhead ?? 10);
    const last = horizon[horizon.length - 1];
    const { data, error } = await this.db
      .from("scores")
      .select("*, catalysts!inner(*)")
      .eq("partial_window", true)
      .gt("event_date", today)
      .lte("event_date", last)
      .order("score", { ascending: false })
      .limit(300);
    if (error) throw error;
    const items = ((data ?? []) as ScoreRow[])
      .map((r) => this.summaryOf(r))
      .filter((s): s is EventSummary => s !== null)
      .map((s) => toRadarItem(s, today))
      .filter((s) => opts.minScore === undefined || !s.windowOpen || s.score >= opts.minScore);
    return sortRadar(items);
  }

  async searchTickers(query: string): Promise<Company[]> {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    const { data } = await this.db
      .from("catalysts")
      .select("ticker, payload")
      .ilike("ticker", `${q}%`)
      .order("event_date", { ascending: false })
      .limit(40);
    const seen = new Map<string, Company>();
    for (const r of (data ?? []) as { ticker: string; payload: Record<string, unknown> | null }[]) {
      if (seen.has(r.ticker)) continue;
      const name = typeof r.payload?.full_name === "string" ? r.payload.full_name : r.ticker;
      seen.set(r.ticker, { ticker: r.ticker, name, sector: typeof r.payload?.sector === "string" ? r.payload.sector : "" });
    }
    return [...seen.values()].slice(0, 8);
  }

  async getNarration(catalystId: string, score: number): Promise<Narration | null> {
    const { data } = await this.db
      .from("narrations")
      .select("story, caption, model, numbers_verified, created_at")
      .eq("catalyst_id", catalystId)
      .eq("score", score)
      .maybeSingle();
    if (!data) return null;
    const r = data as NarrationRow;
    return { story: r.story, caption: r.caption, model: r.model, numbersVerified: r.numbers_verified, createdAt: r.created_at };
  }

  async saveNarration(catalystId: string, score: number, n: Narration): Promise<void> {
    await this.db.from("narrations").upsert(
      {
        catalyst_id: catalystId,
        score,
        story: n.story,
        caption: n.caption,
        model: n.model,
        numbers_verified: n.numbersVerified,
      },
      { onConflict: "catalyst_id,score" },
    );
  }

  async getCompany(ticker: string): Promise<Company | null> {
    const { data } = await this.db
      .from("catalysts")
      .select("ticker, payload")
      .eq("ticker", ticker.toUpperCase())
      .not("payload->>full_name", "is", null)
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const r = data as { ticker: string; payload: Record<string, unknown> };
    return { ticker: r.ticker, name: String(r.payload.full_name), sector: typeof r.payload.sector === "string" ? r.payload.sector : "" };
  }
}
