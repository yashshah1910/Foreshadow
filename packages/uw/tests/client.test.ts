import { describe, expect, it } from "vitest";
import { UwAccessError, UwApiError, UwAuthError, UwRateLimitError } from "../src/errors";
import { stableHash } from "../src/util";
import { DARK_POOL_ROW, FLOW_ALERT_ROW, OI_CHANGE_ROW, dataRoute, makeClient } from "./helpers";

describe("UwClient request core", () => {
  it("sends bearer auth, Accept and the UW-CLIENT-API-ID header", async () => {
    const { client, calls } = makeClient(dataRoute([]));
    await client.getEconomicCalendar();
    expect(calls).toHaveLength(1);
    expect(calls[0].url.toString()).toBe("https://api.unusualwhales.com/api/market/economic-calendar");
    expect(calls[0].headers.get("authorization")).toBe("Bearer test-key");
    expect(calls[0].headers.get("accept")).toBe("application/json");
    expect(calls[0].headers.get("uw-client-api-id")).toBe("100001");
  });

  it("builds array params as key[]=v and skips undefined", () => {
    const { client } = makeClient(dataRoute([]));
    const url = client.buildUrl("/api/x", { a: 1, b: undefined, c: null, d: ["P", "S"], e: true });
    expect(decodeURIComponent(url)).toBe("https://api.unusualwhales.com/api/x?a=1&d[]=P&d[]=S&e=true");
  });

  it("unwraps { data } and the unusualness single-object envelope", async () => {
    const { client, calls } = makeClient(() => ({
      body: { data: { date: "2026-10-21", opt_samples: 90, opt_vol_pctile: 97.5, stock_samples: 90, stock_vol_pctile: null } },
    }));
    const u = await client.getUnusualness("nvda");
    expect(calls[0].url.pathname).toBe("/api/stock/NVDA/unusualness");
    expect(u).toEqual({ date: "2026-10-21", optVolPctile: 97.5, stockVolPctile: null, optSamples: 90, stockSamples: 90 });
  });

  it("records usage headers and pauses when the minute budget is exhausted", async () => {
    const exhausted: Record<string, string> = {
      "x-uw-daily-req-count": "12",
      "x-uw-token-req-limit": "25000",
      "x-uw-req-per-minute-remaining": "0",
      "x-uw-req-per-minute-reset": "2000",
    };
    const { client, sleeps } = makeClient((_url, i) => ({
      body: { data: [] },
      headers: i === 0 ? exhausted : { "x-uw-req-per-minute-remaining": "119" },
    }));
    await client.getEconomicCalendar();
    expect(client.usage).toMatchObject({ dailyCount: 12, dailyLimit: 25000, minuteRemaining: 0, minuteResetMs: 2000 });
    await client.getEconomicCalendar();
    expect(sleeps.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(2000);
    expect(client.usage.minuteRemaining).toBe(119);
  });
});

describe("typed errors", () => {
  it("401 -> UwAuthError", async () => {
    const { client } = makeClient(() => ({
      status: 401,
      body: { code: "authentication_required", reason: "malformed_token", message: "bad token", request_id: "r1" },
    }));
    const err = await client.getEconomicCalendar().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UwAuthError);
    expect(err).toBeInstanceOf(UwApiError);
    const e = err as UwAuthError;
    expect(e.status).toBe(401);
    expect(e.code).toBe("authentication_required");
    expect(e.reason).toBe("malformed_token");
    expect(e.requestId).toBe("r1");
  });

  it("403 -> UwAccessError carrying the code", async () => {
    const { client } = makeClient(() => ({
      status: 403,
      body: { code: "historic_data_access_missing", message: "date too old" },
    }));
    const err = await client.getOiChange("AAPL", "2020-01-02").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UwAccessError);
    expect((err as UwAccessError).code).toBe("historic_data_access_missing");
    expect((err as UwAccessError).isHistoricLookback).toBe(true);
  });

  it("422 -> UwApiError with the msg (never swallowed)", async () => {
    const { client } = makeClient(() => ({ status: 422, body: { msg: "invalid date", path: "/x", query: "", url: "" } }));
    const err = await client.getOiChange("AAPL", "nope").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UwApiError);
    expect((err as UwApiError).status).toBe(422);
    expect((err as UwApiError).message).toContain("invalid date");
  });

  it("429 waits for the reset header and retries", async () => {
    const { client, calls, sleeps } = makeClient((_url, i) =>
      i < 2
        ? { status: 429, body: { message: "slow down" }, headers: { "x-uw-req-per-minute-reset": "1500" } }
        : { body: { data: [{ event: "CPI", time: "2026-10-22T12:30:00Z", type: "report" }] } },
    );
    const rows = await client.getEconomicCalendar();
    expect(rows).toHaveLength(1);
    expect(calls).toHaveLength(3);
    expect(sleeps.filter((ms) => ms === 1500)).toHaveLength(2);
  });

  it("429 with no reset header waits 5s; exhausted retries -> UwRateLimitError", async () => {
    const { client, calls, sleeps } = makeClient(() => ({ status: 429, body: { message: "slow down" } }));
    const err = await client.getEconomicCalendar().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UwRateLimitError);
    expect(calls).toHaveLength(4);
    expect(sleeps.filter((ms) => ms === 5000)).toHaveLength(3);
  });

  it("5xx retries with backoff then succeeds", async () => {
    const { client, calls, sleeps } = makeClient((_url, i) =>
      i === 0 ? { status: 500, text: "Something went wrong" } : { body: { data: [] } },
    );
    await client.getEconomicCalendar();
    expect(calls).toHaveLength(2);
    expect(sleeps[0]).toBe(500);
  });

  it("404 is not retried", async () => {
    const { client, calls } = makeClient(() => ({ status: 404, text: "Not Found" }));
    await expect(client.getEconomicCalendar()).rejects.toBeInstanceOf(UwApiError);
    expect(calls).toHaveLength(1);
  });
});

describe("getFlowAlerts", () => {
  it("normalizes rows: side, ET trade date, parsed numbers", async () => {
    const rows = [
      { ...FLOW_ALERT_ROW, id: "a1", created_at: "2026-10-21T23:30:00Z" },
      { ...FLOW_ALERT_ROW, id: "a2", created_at: "2026-10-22T03:30:00Z", total_ask_side_prem: "10", total_bid_side_prem: "500" },
      { ...FLOW_ALERT_ROW, id: "a3", created_at: "2026-10-22T13:30:00Z", total_ask_side_prem: "0", total_bid_side_prem: "0", has_sweep: false, type: "put" },
    ];
    const { client, calls } = makeClient(dataRoute(rows));
    const alerts = await client.getFlowAlerts({ ticker: "msft", newerThan: "2026-10-21", olderThan: "2026-10-23", minPremium: 10000 });
    const q = calls[0].url.searchParams;
    expect(calls[0].url.pathname).toBe("/api/option-trades/flow-alerts");
    expect(q.get("ticker_symbol")).toBe("MSFT");
    expect(q.get("newer_than")).toBe("2026-10-21");
    expect(q.get("older_than")).toBe("2026-10-23");
    expect(q.get("min_premium")).toBe("10000");
    expect(q.get("limit")).toBe("200");
    expect(alerts.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(alerts[0]).toMatchObject({
      ticker: "MSFT",
      tradeDate: "2026-10-21",
      type: "call",
      strike: 375,
      expiry: "2023-12-22",
      premium: 186705,
      size: 461,
      side: "ask",
      isSweep: true,
      volume: 461,
      openInterest: 1494,
      underlyingPrice: 372.99,
      rule: "RepeatedHits",
      executedAt: "2026-10-21T23:30:00Z",
    });
    expect(alerts[1].tradeDate).toBe("2026-10-21"); // 23:30 ET the previous evening
    expect(alerts[1].side).toBe("bid");
    expect(alerts[2]).toMatchObject({ tradeDate: "2026-10-22", side: "mid", isSweep: false, type: "put" });
  });

  it("paginates with the older_than cursor and falls back to a stable id", async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => ({
      ...FLOW_ALERT_ROW,
      created_at: `2026-10-21T15:${String(59 - Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}Z`,
      total_premium: String(100000 + i),
    }));
    const page2 = [{ ...FLOW_ALERT_ROW, created_at: "2026-10-21T14:00:00Z", total_premium: "5" }];
    const { client, calls } = makeClient((_url, i) => ({ body: { data: i === 0 ? page1 : page2 } }));
    const alerts = await client.getFlowAlerts({ ticker: "MSFT", newerThan: "2026-10-21", olderThan: "2026-10-22" });
    expect(calls).toHaveLength(2);
    expect(calls[1].url.searchParams.get("older_than")).toBe("2026-10-21T15:10:00Z");
    expect(alerts).toHaveLength(201);
    const expected = stableHash("MSFT|2026-10-21T14:00:00Z|MSFT231222C00375000|5");
    expect(alerts[0].id).toBe(expected);
    expect(alerts[0].executedAt).toBe("2026-10-21T14:00:00Z");
  });

  it("stops at the page cap and dedupes by id", async () => {
    const { client, calls } = makeClient(() => ({
      body: { data: Array.from({ length: 200 }, () => ({ ...FLOW_ALERT_ROW, id: "same", created_at: "2026-10-21T14:00:00Z" })) },
    }));
    const alerts = await client.getFlowAlerts({ ticker: "MSFT", newerThan: "2026-10-21", olderThan: "2026-10-22" });
    expect(alerts).toHaveLength(1);
    expect(calls.length).toBeLessThanOrEqual(2); // cursor did not move -> stop
  });
});

describe("getOiChange", () => {
  it("pages with page=N until a short page and parses the OCC symbol", async () => {
    const full = Array.from({ length: 500 }, (_, i) => ({ ...OI_CHANGE_ROW, option_symbol: `MSFT231222C00${String(375000 + i).padStart(6, "0")}` }));
    const { client, calls } = makeClient((_url, i) => ({
      body: { data: i === 0 ? full : [{ ...OI_CHANGE_ROW, option_symbol: "MSFT231222P00370000" }, { ...OI_CHANGE_ROW, option_symbol: "garbage" }] },
    }));
    const rows = await client.getOiChange("msft", "2023-12-12");
    expect(calls.map((c) => c.url.searchParams.get("page"))).toEqual(["0", "1"]);
    expect(calls[0].url.pathname).toBe("/api/stock/MSFT/oi-change");
    expect(calls[0].url.searchParams.get("date")).toBe("2023-12-12");
    expect(calls[0].url.searchParams.get("limit")).toBe("500");
    expect(rows).toHaveLength(501);
    expect(rows[0]).toEqual({
      ticker: "MSFT",
      tradeDate: "2023-12-12",
      strike: 375,
      expiry: "2023-12-22",
      type: "call",
      oiChange: 1404,
      prevOi: 90,
      curOi: 1494,
    });
    expect(rows[500]).toMatchObject({ type: "put", strike: 370 });
  });
});

describe("getDarkPool", () => {
  it("skips canceled prints, parses notional and uses tracking_id as id", async () => {
    const rows = [
      DARK_POOL_ROW,
      { ...DARK_POOL_ROW, canceled: true, tracking_id: 2 },
      { ...DARK_POOL_ROW, tracking_id: 3, executed_at: "2025-05-02T15:00:00Z", premium: "2500000.5", price: "25", size: 100000 },
    ];
    const { client, calls } = makeClient(dataRoute(rows));
    const prints = await client.getDarkPool("f", "2025-05-02");
    expect(calls[0].url.pathname).toBe("/api/darkpool/F");
    expect(calls[0].url.searchParams.get("min_premium")).toBe("1000000");
    expect(calls[0].url.searchParams.get("limit")).toBe("500");
    expect(prints.map((p) => p.id)).toEqual(["71984388012245", "3"]);
    expect(prints[0]).toEqual({
      id: "71984388012245",
      ticker: "F",
      tradeDate: "2025-05-02",
      executedAt: "2025-05-02T13:42:12Z",
      price: 18.9904,
      size: 6400,
      notional: 121538.56,
    });
    expect(prints[1].notional).toBe(2500000.5);
  });

  it("paginates with older_than = oldest executed_at when a page is full", async () => {
    const full = Array.from({ length: 500 }, (_, i) => ({
      ...DARK_POOL_ROW,
      tracking_id: 1000 + i,
      executed_at: `2025-05-02T${String(10 + Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00Z`,
    }));
    const { client, calls } = makeClient((_url, i) => ({ body: { data: i === 0 ? full : [] } }));
    const prints = await client.getDarkPool("F", "2025-05-02", { minPremium: 500000 });
    expect(calls).toHaveLength(2);
    expect(calls[0].url.searchParams.get("min_premium")).toBe("500000");
    expect(calls[1].url.searchParams.get("older_than")).toBe("2025-05-02T10:00:00Z");
    expect(prints).toHaveLength(500);
  });
});

describe("getOhlcDaily", () => {
  it("maps date / start_time, filters to the range and sizes the request", async () => {
    const rows = [
      { open: "100", high: "101", low: "99", close: "100.5", volume: 1000, market_time: "r", date: "2026-10-13" },
      { open: "100.5", high: "102", low: "100", close: "101.5", volume: 1100, market_time: "r", start_time: "2026-10-14T13:30:00Z" },
      { open: "101.5", high: "103", low: "101", close: "102", volume: 900, market_time: "po", date: "2026-10-15" },
      { open: "102", high: "104", low: "101", close: "103", volume: 950, date: "2026-10-16" },
      { open: "1", high: "1", low: "1", close: "1", volume: 1, date: "2026-10-20" },
    ];
    const { client, calls } = makeClient(dataRoute(rows));
    const bars = await client.getOhlcDaily("aapl", { startDate: "2026-10-14", endDate: "2026-10-16" });
    expect(calls[0].url.pathname).toBe("/api/stock/AAPL/ohlc/1d");
    expect(calls[0].url.searchParams.get("end_date")).toBe("2026-10-16");
    expect(Number(calls[0].url.searchParams.get("limit"))).toBeGreaterThanOrEqual(3);
    expect(bars.map((b) => b.date)).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(bars[0]).toEqual({ ticker: "AAPL", date: "2026-10-14", open: 100.5, high: 102, low: 100, close: 101.5, volume: 1100 });
    expect(bars[1].close).toBe(102); // market_time "po" rows are kept
  });

  it("caps limit at 2500 and returns [] for an inverted range", async () => {
    const { client, calls } = makeClient(dataRoute([]));
    await client.getOhlcDaily("AAPL", { startDate: "2000-01-03", endDate: "2026-10-16" });
    expect(calls[0].url.searchParams.get("limit")).toBe("2500");
    expect(await client.getOhlcDaily("AAPL", { startDate: "2026-10-17", endDate: "2026-10-16" })).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

describe("volatility endpoints", () => {
  it("getInterpolatedIv converts implied_move_perc to percent", async () => {
    const rows = [
      { date: "2026-10-21", days: 30, implied_move_perc: "0.12", percentile: "60.1", volatility: "0.40" },
      { date: "2026-10-21", days: 1, implied_move_perc: "0.058", percentile: "77.193", volatility: "0.299" },
      { date: "2026-10-21", days: 5, implied_move_perc: "0.08", percentile: "70", volatility: "0.35" },
    ];
    const { client, calls } = makeClient(dataRoute(rows));
    const iv = await client.getInterpolatedIv("NVDA", "2026-10-21");
    expect(calls[0].url.pathname).toBe("/api/stock/NVDA/interpolated-iv");
    expect(calls[0].url.searchParams.get("date")).toBe("2026-10-21");
    expect(iv.map((r) => r.days)).toEqual([1, 5, 30]);
    expect(iv[0]).toEqual({ date: "2026-10-21", days: 1, volatility: 0.299, impliedMovePct: 5.8, percentile: 77.193 });
  });

  it("getOptionsVolumeHistory sums call+put, sorts ascending and clamps limit", async () => {
    const rows = [
      { date: "2026-10-21", call_volume: 1071546, put_volume: 666386, call_premium: "208699280", put_premium: "125472872" },
      { date: "2026-10-20", call_volume: 100, put_volume: 50, call_premium: "1", put_premium: "2" },
    ];
    const { client, calls } = makeClient(dataRoute(rows));
    const history = await client.getOptionsVolumeHistory("nvda", { limit: 9000 });
    expect(calls[0].url.pathname).toBe("/api/stock/NVDA/options-volume");
    expect(calls[0].url.searchParams.get("limit")).toBe("500");
    expect(history.map((h) => h.date)).toEqual(["2026-10-20", "2026-10-21"]);
    expect(history[1]).toEqual({ date: "2026-10-21", callVolume: 1071546, putVolume: 666386, totalVolume: 1737932, callPremium: 208699280, putPremium: 125472872 });
  });

  it("getRiskReversalSkew parses risk_reversal and keeps the expiry", async () => {
    const rows = [{ date: "2026-10-21", delta: 25, risk_reversal: "-0.021", ticker: "NVDA" }];
    const { client, calls } = makeClient(dataRoute(rows));
    const skew = await client.getRiskReversalSkew("NVDA", { expiry: "2026-11-20", date: "2026-10-21" });
    const q = calls[0].url.searchParams;
    expect(calls[0].url.pathname).toBe("/api/stock/NVDA/historical-risk-reversal-skew");
    expect([q.get("expiry"), q.get("delta"), q.get("timeframe"), q.get("date")]).toEqual(["2026-11-20", "25", "1Y", "2026-10-21"]);
    expect(skew).toEqual([{ date: "2026-10-21", delta: 25, skew: -0.021, expiry: "2026-11-20" }]);
  });
});
