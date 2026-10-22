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
  toTradeExample,
  upcomingTradingDays,
  type Catalyst,
  type CatalystKind,
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
  Scorecard,
  ScorecardCase,
  Stats,
} from "./types";
import {
  applyLeaderboardFilters,
  buildScorecard,
  companyFromCatalyst,
  hitRate,
  isoDaysAgo,
  prettyCompanyName,
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
  /** Absent on list rows, which select only `breakdown_daily`. */
  breakdown?: StoredScore["breakdown"];
  breakdown_daily?: StoredScore["breakdown"]["daily"];
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

/**
 * Columns for list queries: everything a case row shows, with only the
 * breakdown's daily numbers. Full breakdowns are about 6KB a row and a
 * list fetches up to 400 rows.
 */
const LIST_COLUMNS =
  "catalyst_id, ticker, event_date, score, direction, verdict, realized_move_pct, implied_move_pct, partial_window, flags, computed_at, breakdown_daily:breakdown->daily, catalysts!inner(*)";

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
    // List rows carry only the daily numbers (for the sparkline); the case query carries everything.
    // Rows written before the scorer stripped raw fields still carry UW ids; never pass them on.
    breakdown: r.breakdown
      ? { ...r.breakdown, topAlerts: (r.breakdown.topAlerts ?? []).map(toTradeExample) }
      : ({ daily: r.breakdown_daily ?? [] } as unknown as StoredScore["breakdown"]),
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
    // The raw calendar row (EPS estimates, expected-move fields, ...) is Unusual Whales data: keep it on the
    // server. Summaries reach client components, so they carry only the company fields taken from it.
    return toSummary(rowToStored(r), { ...c, payload: {} }, companyFromCatalyst(c));
  }

  async getStats(): Promise<Stats> {
    const today = todayIso();
    const since = isoDaysAgo(today, 90);
    // Light columns only, paged past PostgREST's 1,000-row cap.
    type Light = Pick<ScoreRow, "ticker" | "event_date" | "score" | "verdict" | "partial_window" | "flags" | "computed_at">;
    const rows: Light[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.db
        .from("scores")
        .select("ticker, event_date, score, verdict, partial_window, flags, computed_at")
        .order("catalyst_id")
        .range(from, from + 999);
      if (error) throw error;
      rows.push(...((data ?? []) as Light[]));
      if (!data || data.length < 1000) break;
    }
    const past = rows.filter(
      (r) =>
        !r.partial_window &&
        !r.flags?.isIndexOrEtf &&
        !r.flags?.insufficientHistory &&
        (r.verdict === "matched" || r.verdict === "missed") &&
        r.event_date >= since &&
        r.event_date <= today,
    );
    const unusual = past.filter((r) => Number(r.score) >= 40);
    const lastComputedAt = rows.reduce<string | null>((m, r) => (r.computed_at && (m === null || r.computed_at > m) ? r.computed_at : m), null);
    return {
      mode: "supabase",
      today,
      synthetic: false,
      events: rows.length,
      tickers: new Set(rows.map((r) => r.ticker)).size,
      lastComputedAt,
      heroCatalystId: null,
      past: {
        checked: past.length,
        unusual: unusual.length,
        unusualRight: unusual.filter((r) => r.verdict === "matched").length,
      },
    };
  }

  async getScorecard(): Promise<Scorecard> {
    type Row = Pick<ScoreRow, "score" | "direction" | "verdict" | "partial_window" | "flags" | "realized_move_pct" | "implied_move_pct"> & {
      catalysts: { kind: CatalystKind } | { kind: CatalystKind }[] | null;
    };
    const rows: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.db
        .from("scores")
        .select("score, direction, verdict, partial_window, flags, realized_move_pct, implied_move_pct, catalysts!inner(kind)")
        .eq("partial_window", false)
        .in("verdict", ["matched", "missed"])
        .order("catalyst_id")
        .range(from, from + 999);
      if (error) throw error;
      rows.push(...((data ?? []) as unknown as Row[]));
      if (!data || data.length < 1000) break;
    }
    const cases: ScorecardCase[] = rows
      .filter((r) => !r.flags?.isIndexOrEtf && !r.flags?.insufficientHistory)
      .map((r) => {
        const cat = Array.isArray(r.catalysts) ? r.catalysts[0] : r.catalysts;
        return {
          kind: cat?.kind ?? "earnings",
          score: num(r.score) ?? 0,
          direction: r.direction,
          verdict: r.verdict,
          realizedMovePct: num(r.realized_move_pct),
          impliedMovePct: num(r.implied_move_pct),
        };
      });
    return buildScorecard(cases);
  }

  async getLeaderboard(filters: LeaderboardFilters = {}): Promise<EventSummary[]> {
    const today = todayIso();
    const since = isoDaysAgo(today, filters.days ?? 90);
    // Fetch the rows the chosen order needs: the 400 highest scores, the 400 newest, or the 200 biggest rises and falls.
    const base = () => {
      let q = this.db
        .from("scores")
        .select(LIST_COLUMNS)
        .eq("partial_window", false)
        .gte("event_date", since)
        .lte("event_date", today)
        .in("verdict", ["matched", "missed"]);
      if (filters.kind && filters.kind !== "all") q = q.eq("catalysts.kind", filters.kind);
      if (filters.minScore !== undefined) q = q.gte("score", filters.minScore);
      if (filters.matchedOnly) q = q.eq("verdict", "matched");
      return q;
    };
    const sort = filters.sort ?? "score";
    // Twice the rows asked for (plus a margin) covers the few that applyLeaderboardFilters drops, without reading
    // 400 rows of JSON for a list of 20: that read timed out while the database was busy.
    const want = Math.min(400, (filters.limit ?? 20) * 2 + 20);
    const queries =
      sort === "new"
        ? [base().order("event_date", { ascending: false }).order("score", { ascending: false }).limit(want)]
        : sort === "move"
          ? [
              base().not("realized_move_pct", "is", null).order("realized_move_pct", { ascending: false }).limit(Math.min(200, want)),
              base().not("realized_move_pct", "is", null).order("realized_move_pct", { ascending: true }).limit(Math.min(200, want)),
            ]
          : [base().order("score", { ascending: false }).limit(want)];
    const results = await Promise.all(queries);
    const seen = new Set<string>();
    const rows: EventSummary[] = [];
    for (const { data, error } of results) {
      if (error) throw error;
      for (const r of (data ?? []) as unknown as ScoreRow[]) {
        if (seen.has(r.catalyst_id)) continue;
        seen.add(r.catalyst_id);
        const s = this.summaryOf(r);
        if (s) rows.push(s);
      }
    }
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
        .select(LIST_COLUMNS)
        .eq("ticker", catalyst.ticker)
        .neq("catalyst_id", id)
        .order("event_date", { ascending: false })
        .limit(24),
    ]);
    const footprint = ((fp.data ?? []) as { trade_date: string; payload: DailyFootprint }[])
      .map((r) => r.payload)
      .sort((a, b) => a.date.localeCompare(b.date));
    const chartBars = ((bars.data ?? []) as { trade_date: string; payload: OhlcBar }[]).map((r) => r.payload);
    const relatedRows = ((related.data ?? []) as unknown as ScoreRow[]).map((r) => this.summaryOf(r)).filter((s): s is EventSummary => s !== null);
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
    const [{ data, error }, upcoming] = await Promise.all([
      this.db.from("scores").select(LIST_COLUMNS).eq("ticker", t).order("event_date", { ascending: false }).limit(60),
      this.db.from("catalysts").select("id, kind, event_date, title").eq("ticker", t).gte("event_date", todayIso()).order("event_date").limit(8),
    ]);
    if (error) throw error;
    const events = ((data ?? []) as unknown as ScoreRow[]).map((r) => this.summaryOf(r)).filter((s): s is EventSummary => s !== null);
    if (events.length === 0) return this.queuedDossier(t);
    const company = events.map((e) => e.company).find((c): c is Company => c !== null) ?? null;
    const scored = new Set(events.map((e) => e.catalyst.id));
    const next = ((upcoming.data ?? []) as { id: string; kind: CatalystKind; event_date: string; title: string }[])
      .filter((r) => !scored.has(r.id))
      .map((r) => ({ id: r.id, kind: r.kind, eventDate: r.event_date, title: r.title }));
    return { ticker: t, company, events, hitRate: hitRate(events), ...(next.length ? { next } : {}) };
  }

  /** A ticker whose news is on file but not scored yet (e.g. mid-backfill): a page, not a 404. */
  private async queuedDossier(t: string): Promise<Dossier | null> {
    const { data, error } = await this.db
      .from("catalysts")
      .select("id, kind, event_date, title, payload")
      .eq("ticker", t)
      .order("event_date", { ascending: false })
      .limit(20);
    if (error) throw error;
    const rows = (data ?? []) as { id: string; kind: CatalystKind; event_date: string; title: string; payload: Record<string, unknown> | null }[];
    if (rows.length === 0) return null;
    const p = rows.find((r) => typeof r.payload?.full_name === "string")?.payload ?? null;
    const cap = Number(p?.marketcap ?? p?.market_cap);
    const company: Company | null = p
      ? { ticker: t, name: prettyCompanyName(String(p.full_name)), sector: typeof p.sector === "string" ? p.sector : "", marketcap: Number.isFinite(cap) && cap > 0 ? cap : undefined }
      : null;
    return {
      ticker: t,
      company,
      events: [],
      hitRate: hitRate([]),
      queued: rows.map((r) => ({ id: r.id, kind: r.kind, eventDate: r.event_date, title: r.title })),
    };
  }

  async getRadar(opts: { daysAhead?: number; minScore?: number } = {}): Promise<RadarItem[]> {
    const today = todayIso();
    const horizon = upcomingTradingDays(today, opts.daysAhead ?? 10);
    const last = horizon[horizon.length - 1];
    const { data, error } = await this.db
      .from("scores")
      .select(LIST_COLUMNS)
      .eq("partial_window", true)
      .gt("event_date", today)
      .lte("event_date", last)
      .order("score", { ascending: false })
      .limit(300);
    if (error) throw error;
    const items = ((data ?? []) as unknown as ScoreRow[])
      .map((r) => this.summaryOf(r))
      .filter((s): s is EventSummary => s !== null)
      .map((s) => toRadarItem(s, today))
      .filter((s) => opts.minScore === undefined || !s.windowOpen || s.score >= opts.minScore);
    return sortRadar(items);
  }

  async searchTickers(query: string): Promise<Company[]> {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    // Ticker prefix or company name ("tesla", "apple"). Strip characters that
    // mean something in PostgREST's filter syntax.
    const safe = q.replace(/[^A-Z0-9 .&'-]/g, "");
    if (!safe) return [];
    const { data } = await this.db
      .from("catalysts")
      .select("ticker, payload")
      .or(`ticker.ilike.${safe}%,payload->>full_name.ilike.*${safe}*`)
      .order("event_date", { ascending: false })
      .limit(80);
    const seen = new Map<string, Company>();
    for (const r of (data ?? []) as { ticker: string; payload: Record<string, unknown> | null }[]) {
      if (seen.has(r.ticker)) continue;
      const name = typeof r.payload?.full_name === "string" ? prettyCompanyName(r.payload.full_name) : r.ticker;
      seen.set(r.ticker, { ticker: r.ticker, name, sector: typeof r.payload?.sector === "string" ? r.payload.sector : "" });
    }
    // Exact ticker first, then ticker prefixes, then name matches.
    const rank = (c: Company) =>
      c.ticker === q ? 0 : c.ticker.startsWith(q) ? 1 : c.name.toUpperCase().startsWith(safe) ? 2 : 3;
    return [...seen.values()]
      .sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length || a.ticker.localeCompare(b.ticker))
      .slice(0, 8);
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
    return { ticker: r.ticker, name: prettyCompanyName(String(r.payload.full_name)), sector: typeof r.payload.sector === "string" ? r.payload.sector : "" };
  }
}
