import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { StoredScore } from "@foreshadow/core";
import type { FlowAlert } from "@foreshadow/core";
import type { InvestigateResult } from "@foreshadow/narrator";
import { publicAnswer } from "@/lib/ask";
import { API_SAMPLE_SIZE, sampleTrades, tradeTotals } from "@/lib/data/sample";
import { foreshadowHistory, foreshadowRadar, foreshadowScore, foreshadowSimilar } from "@/lib/tools/foreshadow";

// `side` is Foreshadow's bought/sold reading of the trade (ask or bid), not a raw UW field.
const TRADE_KEYS = ["expiry", "isSweep", "premium", "side", "strike", "tradeDate", "type"];

function alert(id: string, premium: number, executedAt = "2026-09-15T15:00:00Z"): FlowAlert {
  return {
    id,
    ticker: "VXRA",
    tradeDate: executedAt.slice(0, 10),
    executedAt,
    type: "call",
    strike: 40,
    expiry: "2026-09-19",
    premium,
    size: 500,
    side: "ask",
    isSweep: true,
    volume: 900,
    openInterest: 120,
    underlyingPrice: 31.2,
    rule: "RepeatedHits",
  };
}

/** Every key anywhere in a JSON value. */
function keysDeep(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) keysDeep(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysDeep(v, out);
    }
  }
  return out;
}

describe("sampleTrades", () => {
  it("keeps the largest trades, biggest first, without ids or raw fields", () => {
    const rows = sampleTrades([alert("a", 10), alert("b", 30), alert("c", 20)], 2);
    expect(rows.map((r) => r.premium)).toEqual([30, 20]);
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(TRADE_KEYS);
  });

  it("totals every trade, not just the sample", () => {
    expect(tradeTotals([alert("a", 10), alert("b", 30)])).toEqual({ count: 2, premium: 40, bought: 40 });
  });
});

describe("stored scores", () => {
  it("keep only example fields on their top trades", () => {
    const scores = JSON.parse(readFileSync("supabase/fixtures/scores.json", "utf8")) as StoredScore[];
    const trades = scores.flatMap((s) => s.breakdown.topAlerts);
    expect(trades.length).toBeGreaterThan(0);
    for (const t of trades) expect(Object.keys(t).sort()).toEqual(TRADE_KEYS);
  });
});

describe("foreshadow_score", () => {
  it("returns derived results and a few example trades, never raw UW rows", async () => {
    const res = await foreshadowScore({ ticker: "VXRA", eventDate: "2026-09-18" });
    if ("error" in res) throw new Error(res.error);
    expect(res).not.toHaveProperty("topAlerts");
    expect(res.trades.count).toBeGreaterThan(res.trades.largest.length);
    expect(res.trades.totalPremium).toBeGreaterThan(0);
    expect(res.trades.largest.length).toBe(API_SAMPLE_SIZE);
    for (const t of res.trades.largest) expect(Object.keys(t).sort()).toEqual(TRADE_KEYS);
    const premiums = res.trades.largest.map((t) => t.premium);
    expect(premiums).toEqual([...premiums].sort((a, b) => b - a));
    const keys = keysDeep(res);
    for (const raw of ["executedAt", "size", "openInterest", "underlyingPrice", "rule", "alerts", "oiChanges", "darkPool"]) {
      expect(keys.has(raw), raw).toBe(false);
    }
  });
});

describe("foreshadow_radar, foreshadow_history and foreshadow_similar", () => {
  it("carry no trade rows at all", async () => {
    const radar = await foreshadowRadar({ daysAhead: 30 });
    const history = await foreshadowHistory({ ticker: "VXRA" });
    const similar = await foreshadowSimilar({ ticker: "VXRA", eventDate: "2026-09-18" });
    for (const value of [radar, history, similar]) {
      const keys = keysDeep(value);
      for (const raw of ["alerts", "topAlerts", "trades", "executedAt", "strike"]) expect(keys.has(raw), raw).toBe(false);
    }
  });
});

describe("publicAnswer", () => {
  it("drops tool inputs and outputs so UW MCP results stay on the server", () => {
    const result: InvestigateResult = {
      answer: "Someone bet big on a rise.",
      model: "claude-haiku-5-5",
      stopped: "end_turn",
      toolCalls: [
        { name: "get_flow_alerts", input: { ticker: "VXRA" }, output: '[{"id":"uw-1","premium":1}]', source: "uw-mcp", ok: true },
        { name: "foreshadow_score", input: { ticker: "VXRA" }, output: "{}", source: "foreshadow", ok: true },
      ],
    };
    const body = publicAnswer(result);
    expect(body.toolCalls).toEqual([
      { name: "get_flow_alerts", source: "uw-mcp", ok: true },
      { name: "foreshadow_score", source: "foreshadow", ok: true },
    ]);
    expect(JSON.stringify(body)).not.toContain("uw-1");
    expect(body.offTopic).toBe(false);
  });
});
