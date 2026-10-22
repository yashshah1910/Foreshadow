import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UwClient } from "@foreshadow/uw";
import type { TaggerRow } from "@foreshadow/narrator";

vi.mock("@foreshadow/narrator", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@foreshadow/narrator")>()),
  isNarratorConfigured: () => true,
  // Both calendar rows get JPM; the first also lists it twice.
  tagCatalysts: vi.fn(async (rows: TaggerRow[]) =>
    rows.map((r, i) => ({
      id: r.id,
      tickers:
        i === 0
          ? [
              { ticker: "JPM", confidence: 0.7, reason: "rates" },
              { ticker: "jpm", confidence: 0.9, reason: "banks" },
            ]
          : [{ ticker: "JPM", confidence: 0.8, reason: "rates" }],
      sectors: ["financials"],
      relevance: 0.8,
    })),
  ),
}));

const { tagMacroCatalysts } = await import("@/lib/tagger");

describe("tagMacroCatalysts", () => {
  it("writes one row per catalyst id when calendar rows repeat, keeping the most confident tag", async () => {
    const speech = { time: "2026-10-23T14:00:00Z", event: "Fed speaker: Powell", type: "fed-speaker", forecast: null, prev: null, reportedPeriod: null };
    const uw = {
      getPotusSchedule: async () => [],
      getEconomicCalendar: async () => [speech, { ...speech }],
    } as unknown as UwClient;
    const upserts: { id: string; payload: { confidence: number } }[][] = [];
    const db = {
      from: () => ({
        upsert: async (rows: { id: string; payload: { confidence: number } }[]) => {
          upserts.push(rows);
          const ids = rows.map((r) => r.id);
          const dup = new Set(ids).size !== ids.length;
          return { error: dup ? { message: "ON CONFLICT DO UPDATE command cannot affect row a second time" } : null };
        },
      }),
    } as unknown as SupabaseClient;
    const logs: string[] = [];

    const out = await tagMacroCatalysts(db, uw, { today: "2026-10-22", log: (m) => logs.push(m) });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ ticker: "JPM", kind: "economic", eventDate: "2026-10-23", session: "intraday" });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toHaveLength(1);
    expect(upserts[0][0].payload.confidence).toBe(0.9);
    expect(logs.some((l) => /upsert failed/.test(l))).toBe(false);
  });
});
