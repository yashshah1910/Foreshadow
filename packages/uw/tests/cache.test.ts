import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MemoryCache, SupabaseCache } from "../src/cache";

describe("MemoryCache", () => {
  it("round-trips payloads including empty arrays", async () => {
    const cache = new MemoryCache();
    expect(await cache.get("NVDA", "2026-10-21", "flow-alerts")).toBeUndefined();
    await cache.set("nvda", "2026-10-21", "flow-alerts", []);
    await cache.set("NVDA", "2026-10-20", "flow-alerts", [{ id: "a" }]);
    expect(await cache.get("NVDA", "2026-10-21", "flow-alerts")).toEqual([]);
    expect(await cache.get("NVDA", "2026-10-21", "oi-change")).toBeUndefined();
    const many = await cache.getMany<unknown[]>("NVDA", ["2026-10-19", "2026-10-20", "2026-10-21"], "flow-alerts");
    expect([...many.keys()]).toEqual(["2026-10-20", "2026-10-21"]);
    expect(many.get("2026-10-20")).toEqual([{ id: "a" }]);
    await cache.setMany([
      { ticker: "NVDA", tradeDate: "2026-10-19", endpoint: "flow-alerts", payload: [] },
      { ticker: "NVDA", tradeDate: "2026-10-19", endpoint: "darkpool", payload: [1] },
    ]);
    expect(cache.size).toBe(4);
    expect(await cache.get("NVDA", "2026-10-19", "darkpool")).toEqual([1]);
  });
});

interface Row {
  ticker: string;
  trade_date: string;
  endpoint: string;
  payload: unknown;
  fetched_at?: string;
}

type Filter = { col: keyof Row; value: unknown } | { col: keyof Row; values: unknown[] };

/** Minimal chainable double for the Supabase query builder. */
function fakeSupabase() {
  const rows = new Map<string, Row>();
  const key = (r: Row) => `${r.ticker}|${r.trade_date}|${r.endpoint}`;
  const upserts: Row[][] = [];
  const queries: Filter[][] = [];
  function builder(filters: Filter[] = []) {
    const matches = () =>
      [...rows.values()].filter((r) =>
        filters.every((f) => ("values" in f ? f.values.includes(r[f.col]) : r[f.col] === f.value)),
      );
    const self = {
      eq: (col: keyof Row, value: unknown) => builder([...filters, { col, value }]),
      in: (col: keyof Row, values: unknown[]) => builder([...filters, { col, values }]),
      maybeSingle: async () => {
        queries.push(filters);
        const m = matches();
        return { data: m[0] ?? null, error: null };
      },
      then: (resolve: (v: { data: Row[]; error: null }) => unknown, reject?: (e: unknown) => unknown) => {
        queries.push(filters);
        return Promise.resolve({ data: matches(), error: null }).then(resolve, reject);
      },
    };
    return self;
  }
  const client = {
    from: () => ({
      select: () => builder(),
      upsert: async (payload: Row | Row[]) => {
        const batch = Array.isArray(payload) ? payload : [payload];
        upserts.push(batch);
        for (const r of batch) rows.set(key(r), r);
        return { data: null, error: null };
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, rows, upserts, queries };
}

describe("SupabaseCache", () => {
  it("upserts on the composite key and reads back with .in()", async () => {
    const fake = fakeSupabase();
    const cache = new SupabaseCache(fake.client);
    await cache.set("nvda", "2026-10-21", "flow-alerts", []);
    await cache.setMany([
      { ticker: "NVDA", tradeDate: "2026-10-20", endpoint: "flow-alerts", payload: [{ id: "a" }] },
      { ticker: "NVDA", tradeDate: "2026-10-20", endpoint: "oi-change", payload: [{ oi: 1 }] },
    ]);
    expect(fake.rows.size).toBe(3);
    expect(fake.upserts[0][0]).toMatchObject({ ticker: "NVDA", trade_date: "2026-10-21", endpoint: "flow-alerts", payload: [] });
    expect(typeof fake.upserts[0][0].fetched_at).toBe("string");

    expect(await cache.get("NVDA", "2026-10-21", "flow-alerts")).toEqual([]);
    expect(await cache.get("NVDA", "2026-10-22", "flow-alerts")).toBeUndefined();
    const many = await cache.getMany("NVDA", ["2026-10-19", "2026-10-20", "2026-10-21"], "flow-alerts");
    expect([...many.entries()].sort(([a], [b]) => a.localeCompare(b))).toEqual([
      ["2026-10-20", [{ id: "a" }]],
      ["2026-10-21", []],
    ]);
    const last = fake.queries[fake.queries.length - 1];
    expect(last).toContainEqual({ col: "endpoint", value: "flow-alerts" });
    expect(last).toContainEqual({ col: "trade_date", values: ["2026-10-19", "2026-10-20", "2026-10-21"] });
  });

  it("overwrites an existing row on conflict", async () => {
    const fake = fakeSupabase();
    const cache = new SupabaseCache(fake.client);
    await cache.set("NVDA", "2026-10-21", "skew", [{ skew: 1 }]);
    await cache.set("NVDA", "2026-10-21", "skew", [{ skew: 2 }]);
    expect(fake.rows.size).toBe(1);
    expect(await cache.get("NVDA", "2026-10-21", "skew")).toEqual([{ skew: 2 }]);
  });
});
