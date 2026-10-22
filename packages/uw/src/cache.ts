/**
 * Footprint cache: one JSON payload per (ticker, trade date, endpoint).
 *
 * An empty payload (`[]`) is a valid cached value meaning "fetched, nothing
 * that day" — the loader always writes it so quiet days are never refetched.
 * Two implementations: an in-memory map (tests, scripts) and Supabase
 * (`footprints` table, primary key `(ticker, trade_date, endpoint)`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { IsoDate } from "../../core/src/types";

export type CacheEndpoint =
  | "flow-alerts"
  | "oi-change"
  | "darkpool"
  | "ohlc"
  | "interpolated-iv"
  | "skew"
  | "options-volume"
  | "unusualness";

export interface CacheEntry<T> {
  ticker: string;
  tradeDate: IsoDate;
  endpoint: CacheEndpoint;
  payload: T;
}

export interface FootprintCache {
  get<T>(ticker: string, tradeDate: IsoDate, endpoint: CacheEndpoint): Promise<T | undefined>;
  getMany<T>(ticker: string, tradeDates: IsoDate[], endpoint: CacheEndpoint): Promise<Map<IsoDate, T>>;
  set<T>(ticker: string, tradeDate: IsoDate, endpoint: CacheEndpoint, payload: T): Promise<void>;
  setMany<T>(entries: CacheEntry<T>[]): Promise<void>;
}

function cacheKey(ticker: string, tradeDate: IsoDate, endpoint: CacheEndpoint): string {
  return `${ticker.toUpperCase()}|${tradeDate}|${endpoint}`;
}

/** Process-local cache. Payloads are stored by reference (treat them as immutable). */
export class MemoryCache implements FootprintCache {
  private readonly store = new Map<string, unknown>();

  get size(): number {
    return this.store.size;
  }

  async get<T>(ticker: string, tradeDate: IsoDate, endpoint: CacheEndpoint): Promise<T | undefined> {
    const key = cacheKey(ticker, tradeDate, endpoint);
    return this.store.has(key) ? (this.store.get(key) as T) : undefined;
  }

  async getMany<T>(ticker: string, tradeDates: IsoDate[], endpoint: CacheEndpoint): Promise<Map<IsoDate, T>> {
    const out = new Map<IsoDate, T>();
    for (const d of tradeDates) {
      const key = cacheKey(ticker, d, endpoint);
      if (this.store.has(key)) out.set(d, this.store.get(key) as T);
    }
    return out;
  }

  async set<T>(ticker: string, tradeDate: IsoDate, endpoint: CacheEndpoint, payload: T): Promise<void> {
    this.store.set(cacheKey(ticker, tradeDate, endpoint), payload);
  }

  async setMany<T>(entries: CacheEntry<T>[]): Promise<void> {
    for (const e of entries) this.store.set(cacheKey(e.ticker, e.tradeDate, e.endpoint), e.payload);
  }

  clear(): void {
    this.store.clear();
  }
}

interface FootprintRow {
  ticker: string;
  trade_date: string;
  endpoint: string;
  payload: unknown;
  fetched_at?: string;
}

const IN_CHUNK = 200;
const UPSERT_CHUNK = 500;
/** Keep each upsert well under Postgres' statement timeout: big tickers carry thousands of contracts per day. */
const UPSERT_MAX_BYTES = 1_500_000;

/** Supabase errors worth retrying: gateway hiccups and statement timeouts. */
function isTransient(message: string): boolean {
  return /bad gateway|gateway|timeout|timed out|<!doctype html|fetch failed|ECONNRESET|503|502|504/i.test(message);
}

async function withRetry<T>(label: string, fn: () => Promise<{ data: T; error: { message: string } | null }>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await fn();
    if (!error) return data;
    if (attempt >= 4 || !isTransient(error.message)) throw new Error(`${label}: ${error.message.slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
}

/** Batches of rows, each under `maxBytes` of JSON (and at most `maxRows`). */
function chunkBySize<T>(items: T[], maxRows: number, maxBytes: number): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = JSON.stringify(item).length;
    if (cur.length && (cur.length >= maxRows || bytes + size > maxBytes)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(item);
    bytes += size;
  }
  if (cur.length) out.push(cur);
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Supabase-backed cache over
 * `footprints(ticker text, trade_date date, endpoint text, payload jsonb, fetched_at timestamptz)`.
 * Writes use `upsert` on the composite key; reads use `.in("trade_date", ...)`
 * in chunks of 200 dates.
 */
export class SupabaseCache implements FootprintCache {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly table = "footprints",
  ) {}

  async get<T>(ticker: string, tradeDate: IsoDate, endpoint: CacheEndpoint): Promise<T | undefined> {
    const data = await withRetry("footprint cache read failed", async () =>
      this.supabase
        .from(this.table)
        .select("payload")
        .eq("ticker", ticker.toUpperCase())
        .eq("trade_date", tradeDate)
        .eq("endpoint", endpoint)
        .maybeSingle(),
    );
    const row = data as Pick<FootprintRow, "payload"> | null;
    return row ? (row.payload as T) : undefined;
  }

  async getMany<T>(ticker: string, tradeDates: IsoDate[], endpoint: CacheEndpoint): Promise<Map<IsoDate, T>> {
    const out = new Map<IsoDate, T>();
    if (tradeDates.length === 0) return out;
    for (const dates of chunk([...new Set(tradeDates)], IN_CHUNK)) {
      const data = await withRetry("footprint cache read failed", async () =>
        this.supabase
          .from(this.table)
          .select("trade_date, payload")
          .eq("ticker", ticker.toUpperCase())
          .eq("endpoint", endpoint)
          .in("trade_date", dates),
      );
      const rows = (data ?? []) as Pick<FootprintRow, "trade_date" | "payload">[];
      for (const row of rows) out.set(String(row.trade_date).slice(0, 10), row.payload as T);
    }
    return out;
  }

  async set<T>(ticker: string, tradeDate: IsoDate, endpoint: CacheEndpoint, payload: T): Promise<void> {
    await this.setMany([{ ticker, tradeDate, endpoint, payload }]);
  }

  async setMany<T>(entries: CacheEntry<T>[]): Promise<void> {
    if (entries.length === 0) return;
    const fetchedAt = new Date().toISOString();
    const rows: FootprintRow[] = entries.map((e) => ({
      ticker: e.ticker.toUpperCase(),
      trade_date: e.tradeDate,
      endpoint: e.endpoint,
      payload: e.payload,
      fetched_at: fetchedAt,
    }));
    for (const batch of chunkBySize(rows, UPSERT_CHUNK, UPSERT_MAX_BYTES)) {
      await withRetry("footprint cache write failed", async () =>
        this.supabase.from(this.table).upsert(batch, { onConflict: "ticker,trade_date,endpoint" }),
      );
    }
  }
}
