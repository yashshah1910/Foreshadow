import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UwClient } from "@foreshadow/uw";
import type { Catalyst } from "@foreshadow/core";

const catalyst: Catalyst = {
  id: "earnings:KLAC:2026-10-28",
  ticker: "KLAC",
  kind: "earnings",
  eventDate: "2026-10-28",
  session: "afterhours",
  title: "KLAC earnings",
  source: "uw",
  payload: { marketcap: 90_000_000_000, has_options: true },
};

// Already stored, and its window has not opened yet, so it is not scored.
const later: Catalyst = { ...catalyst, id: "earnings:NVDA:2026-11-04", ticker: "NVDA", eventDate: "2026-11-04", title: "NVDA earnings" };
// Not stored yet.
const fresh: Catalyst = { ...later, id: "earnings:AMD:2026-11-04", ticker: "AMD", title: "AMD earnings" };

vi.mock("@foreshadow/uw", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@foreshadow/uw")>()),
  fetchCatalysts: vi.fn(async () => [catalyst, later, fresh]),
  // A ticker whose footprint load never finishes inside the run.
  buildScoreInput: vi.fn(() => new Promise(() => {})),
}));

const { runIngest, settleBy } = await import("@/lib/ingest");

/** Chainable stand-in for the Supabase query builder; records writes. */
function fakeDb(savedCatalystIds: string[] = []) {
  const runUpdates: Record<string, unknown>[] = [];
  const catalystUpserts: string[][] = [];
  const builder = (table: string) => {
    let op = "select";
    let columns = "*";
    const q: Record<string, unknown> = {
      then(resolve: (v: unknown) => void) {
        let data: unknown = [];
        if (table === "ingest_runs" && op === "insert") data = { id: 7 };
        if (table === "catalysts" && op === "select" && columns === "id") data = savedCatalystIds.map((id) => ({ id }));
        resolve({ data, error: null });
      },
    };
    for (const m of ["in", "eq", "gte", "lte", "limit", "single", "maybeSingle"]) q[m] = () => q;
    q.select = (cols?: string) => {
      if (op === "select") columns = cols ?? "*";
      return q;
    };
    for (const m of ["insert", "upsert", "update"]) {
      q[m] = (payload: Record<string, unknown> | { id: string }[]) => {
        op = m;
        if (table === "ingest_runs" && m === "update") runUpdates.push(payload as Record<string, unknown>);
        if (table === "catalysts" && m === "upsert") catalystUpserts.push((payload as { id: string }[]).map((r) => r.id));
        return q;
      };
    }
    return q;
  };
  return { db: { from: builder } as unknown as SupabaseClient, runUpdates, catalystUpserts };
}

const uw = { usage: { dailyCount: 42 } } as unknown as UwClient;

describe("runIngest deadline", () => {
  it("reports back and records the run's status when an event is still loading at the deadline", async () => {
    const { db, runUpdates } = fakeDb();
    const started = Date.now();
    const report = await runIngest(db, uw, { mode: "radar", today: "2026-10-22", tagMacro: false, deadlineMs: 50 });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(report.runId).toBe(7);
    expect(report.candidates).toBe(1);
    expect(report.scored).toBe(0);
    expect(report.warnings.some((w) => /run deadline with 1 events in flight/.test(w))).toBe(true);
    expect(runUpdates).toHaveLength(1);
    expect(runUpdates[0]).toMatchObject({ status: "error", scored: 0, requests: 42 });
    expect(String(runUpdates[0].error)).toMatch(/run deadline/);
  });
});

describe("runIngest radar catalyst writes", () => {
  it("writes only catalysts not stored yet, then refreshes the ones it is about to score", async () => {
    const { db, catalystUpserts } = fakeDb([catalyst.id, later.id]);
    await runIngest(db, uw, { mode: "radar", today: "2026-10-22", tagMacro: false, deadlineMs: 50 });
    expect(catalystUpserts).toEqual([[fresh.id], [catalyst.id]]);
  });

  it("still writes every catalyst in daily mode", async () => {
    const { db, catalystUpserts } = fakeDb([catalyst.id, later.id]);
    await runIngest(db, uw, { mode: "daily", today: "2026-10-22", tagMacro: false, deadlineMs: 50 });
    expect(catalystUpserts[0]).toEqual([catalyst.id, later.id, fresh.id]);
  });
});

describe("settleBy", () => {
  it("returns the value when work finishes first", async () => {
    await expect(settleBy(Promise.resolve(3), Date.now() + 1_000)).resolves.toEqual({ done: true, value: 3 });
  });

  it("gives up at the deadline", async () => {
    await expect(settleBy(new Promise(() => {}), Date.now() + 10)).resolves.toEqual({ done: false });
  });

  it("waits indefinitely without a deadline", async () => {
    await expect(settleBy(Promise.resolve("x"), undefined)).resolves.toEqual({ done: true, value: "x" });
  });
});
