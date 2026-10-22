import { describe, expect, it } from "vitest";
import type { Catalyst, DarkPoolPrint, FlowAlert, IsoDate, OhlcBar, OiChange } from "../../core/src/types";
import { addTradingDays, baselineWindow, footprintWindow, previousTradingDay, tradingDaysBetween } from "../../core/src/windows";
import { MemoryCache } from "../src/cache";
import type { FlowAlertParams } from "../src/client";
import { UwAccessError } from "../src/errors";
import { buildScoreInput, loadDailyFootprints, loadOutcome, type FootprintClient } from "../src/footprint";
import type { DailyOptionVolume, InterpolatedIvRow, SkewPoint } from "../src/types";

const TODAY: IsoDate = "2026-10-22";
const TICKER = "NVDA";

function historicError(path: string): UwAccessError {
  return new UwAccessError({ status: 403, path, code: "historic_data_access_missing", message: "too old" });
}

function alert(date: IsoDate, n: number): FlowAlert {
  return {
    id: `${date}-${n}`,
    ticker: TICKER,
    tradeDate: date,
    executedAt: `${date}T14:0${n}:00Z`,
    type: "call",
    strike: 100,
    expiry: "2026-11-20",
    premium: 50_000,
    size: 10,
    side: "ask",
    isSweep: false,
  };
}

interface StubOptions {
  /** Dates before this throw the lookback 403 on flow/oi/darkpool. */
  cutoff?: IsoDate;
  /** Which dates have flow alerts (default: every date). */
  alertsOn?: (date: IsoDate) => number;
  today?: IsoDate;
}

interface Calls {
  flow: FlowAlertParams[];
  oi: IsoDate[];
  dp: IsoDate[];
  volume: number[];
  skew: { expiry: IsoDate; date?: IsoDate }[];
  ohlc: { startDate: IsoDate; endDate: IsoDate }[];
  iv: IsoDate[];
}

function stubClient(opts: StubOptions = {}): { client: FootprintClient; calls: Calls } {
  const today = opts.today ?? TODAY;
  const cutoff = opts.cutoff ?? "1900-01-01";
  const alertsOn = opts.alertsOn ?? (() => 2);
  const calls: Calls = { flow: [], oi: [], dp: [], volume: [], skew: [], ohlc: [], iv: [] };
  const client: FootprintClient = {
    async getFlowAlerts(params) {
      calls.flow.push(params);
      if (params.newerThan < cutoff) throw historicError("/api/option-trades/flow-alerts");
      const out: FlowAlert[] = [];
      for (const d of tradingDaysBetween(params.newerThan, params.olderThan)) {
        if (d >= params.olderThan) continue;
        for (let i = 0; i < alertsOn(d); i++) out.push(alert(d, i));
      }
      return out;
    },
    async getOiChange(_ticker, date) {
      calls.oi.push(date);
      if (date < cutoff) throw historicError("/oi-change");
      const row: OiChange = { ticker: TICKER, tradeDate: date, strike: 100, expiry: "2026-11-20", type: "call", oiChange: 500, prevOi: 100, curOi: 600 };
      return [row];
    },
    async getDarkPool(_ticker, date) {
      calls.dp.push(date);
      if (date < cutoff) throw historicError("/darkpool");
      const print: DarkPoolPrint = { id: `dp-${date}`, ticker: TICKER, tradeDate: date, executedAt: `${date}T15:00:00Z`, price: 100, size: 20_000, notional: 2_000_000 };
      return date.endsWith("1") ? [print] : [];
    },
    async getOptionsVolumeHistory(_ticker, o) {
      const limit = o?.limit ?? 120;
      calls.volume.push(limit);
      const rows: DailyOptionVolume[] = [];
      let d = today;
      for (let i = 0; i < limit; i++) {
        rows.unshift({ date: d, callVolume: 1000 + i, putVolume: 500, totalVolume: 1500 + i });
        d = previousTradingDay(d);
      }
      return rows;
    },
    async getRiskReversalSkew(_ticker, o) {
      calls.skew.push({ expiry: o.expiry, date: o.date });
      const end = o.date ?? today;
      const rows: SkewPoint[] = tradingDaysBetween(addTradingDays(end, -120), end).map((date, i) => ({ date, delta: 25, skew: 0.01 + i / 10_000, expiry: o.expiry }));
      return rows;
    },
    async getOhlcDaily(_ticker, range) {
      calls.ohlc.push(range);
      return tradingDaysBetween(range.startDate, range.endDate).map((date, i): OhlcBar => ({ ticker: TICKER, date, open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i, volume: 1000 }));
    },
    async getInterpolatedIv(_ticker, date) {
      calls.iv.push(date);
      const rows: InterpolatedIvRow[] = [
        { date, days: 30, volatility: 0.4, impliedMovePct: 12, percentile: 50 },
        { date, days: 1, volatility: 0.3, impliedMovePct: 5.8, percentile: 70 },
        { date, days: 0, volatility: 0.3, impliedMovePct: 0.1, percentile: 70 },
      ];
      return rows;
    },
  };
  return { client, calls };
}

describe("loadDailyFootprints", () => {
  const dates = tradingDaysBetween("2026-10-08", "2026-10-21"); // 10 trading days

  it("fetches only the missing dates, coalesces flow ranges and caches empty days", async () => {
    const cache = new MemoryCache();
    const { client, calls } = stubClient({ alertsOn: (d) => (d === "2026-10-14" ? 0 : 1) });
    expect(dates).toHaveLength(10);
    await cache.setMany([
      { ticker: TICKER, tradeDate: dates[2], endpoint: "flow-alerts", payload: [alert(dates[2], 9)] },
      { ticker: TICKER, tradeDate: dates[3], endpoint: "flow-alerts", payload: [] },
      { ticker: TICKER, tradeDate: dates[4], endpoint: "flow-alerts", payload: [] },
      { ticker: TICKER, tradeDate: dates[0], endpoint: "oi-change", payload: [] },
    ]);
    const { days, warnings } = await loadDailyFootprints(client, cache, "nvda", dates, { today: TODAY });
    expect(warnings).toEqual([]);
    expect(days.map((d) => d.date)).toEqual(dates);

    expect(calls.flow.map((p) => [p.newerThan, p.olderThan])).toEqual([
      [dates[0], "2026-10-10"],
      [dates[5], "2026-10-22"],
    ]);
    expect(calls.oi).toHaveLength(9);
    expect(calls.oi).not.toContain(dates[0]);
    expect(calls.dp).toHaveLength(10);
    expect(calls.volume).toEqual([expect.any(Number)]);
    expect(calls.skew).toEqual([{ expiry: "2026-11-20", date: "2026-10-21" }]);

    expect(days[2].alerts.map((a) => a.id)).toEqual([`${dates[2]}-9`]); // from cache, not refetched
    expect(days[3].alerts).toEqual([]);
    const quiet = days.find((d) => d.date === "2026-10-14");
    expect(quiet?.alerts).toEqual([]);
    expect(await cache.get(TICKER, "2026-10-14", "flow-alerts")).toEqual([]);
    expect(await cache.get(TICKER, "2026-10-14", "darkpool")).toEqual([]);
    expect(await cache.get(TICKER, dates[9], "oi-change")).toHaveLength(1);
    expect(days[0].oiChanges).toEqual([]); // pre-cached empty day is trusted
    expect(days.slice(1).every((d) => d.oiChanges.length === 1)).toBe(true);
    expect(days.every((d) => typeof d.skew === "number")).toBe(true);
    expect(days.every((d) => typeof d.volumePercentile === "number")).toBe(true);
    expect(days.find((d) => d.date === "2026-10-21")?.darkPool).toHaveLength(1);

    const second = stubClient();
    const again = await loadDailyFootprints(second.client, cache, TICKER, dates, { today: TODAY });
    expect(again.days).toHaveLength(10);
    expect(second.calls.flow).toHaveLength(0);
    expect(second.calls.oi).toHaveLength(0);
    expect(second.calls.dp).toHaveLength(0);
    expect(second.calls.volume).toHaveLength(0);
    expect(second.calls.skew).toHaveLength(0);
  });

  it("keeps the OI days that arrived when others fail, so the next run fetches only the rest", async () => {
    const cache = new MemoryCache();
    const { client } = stubClient();
    const failOn = new Set([dates[6], dates[8]]);
    const getOi = client.getOiChange.bind(client);
    client.getOiChange = async (ticker, date) => {
      if (failOn.has(date)) throw new Error(`Time budget exceeded before GET /oi-change ${date}`);
      return getOi(ticker, date);
    };
    await expect(loadDailyFootprints(client, cache, TICKER, dates, { today: TODAY })).rejects.toThrow(/Time budget exceeded/);
    expect(await cache.get(TICKER, dates[5], "oi-change")).toHaveLength(1);
    expect(await cache.get(TICKER, dates[6], "oi-change")).toBeUndefined();

    const second = stubClient();
    await loadDailyFootprints(second.client, cache, TICKER, dates, { today: TODAY });
    expect(second.calls.oi.sort()).toEqual([dates[6], dates[8]]);
  });

  it("loads a few OI dates at a time so a cut-off run still has whole days to cache", async () => {
    const cache = new MemoryCache();
    const { client } = stubClient();
    const getOi = client.getOiChange.bind(client);
    let active = 0;
    let peak = 0;
    let pages = 0;
    client.getOiChange = async (ticker, date) => {
      active++;
      peak = Math.max(peak, active);
      try {
        // Three pages per date; the "deadline" hits after 15 pages in all.
        for (let p = 0; p < 3; p++) {
          await Promise.resolve();
          if (++pages > 15) throw new Error("Time budget exceeded before GET /oi-change");
        }
        return await getOi(ticker, date);
      } finally {
        active--;
      }
    };
    await expect(loadDailyFootprints(client, cache, TICKER, dates, { today: TODAY })).rejects.toThrow(/Time budget exceeded/);
    expect(peak).toBeLessThanOrEqual(3);
    const cached = await cache.getMany(TICKER, dates, "oi-change");
    expect(cached.size).toBeGreaterThanOrEqual(4);
  });

  it("returns empty days for inaccessible history with a warning instead of failing", async () => {
    const cache = new MemoryCache();
    const span = tradingDaysBetween("2026-08-24", "2026-10-21");
    const cutoff = span[20];
    const { client, calls } = stubClient({ cutoff });
    const { days, warnings } = await loadDailyFootprints(client, cache, TICKER, span, { today: TODAY });
    expect(days).toHaveLength(span.length);
    for (const day of days) {
      if (day.date < cutoff) {
        expect(day.alerts).toEqual([]);
        expect(day.oiChanges).toEqual([]);
        expect(day.darkPool).toEqual([]);
      } else {
        expect(day.oiChanges).toHaveLength(1);
        expect(day.alerts.length).toBeGreaterThan(0);
      }
    }
    expect(warnings.filter((w) => w.startsWith("flow-alerts:"))).toHaveLength(1);
    expect(warnings.filter((w) => w.startsWith("oi-change:"))).toHaveLength(1);
    expect(warnings.filter((w) => w.startsWith("darkpool:"))).toHaveLength(1);
    expect(warnings[0]).toContain(`earliest accessible ${cutoff}`);
    // binary search: failed probes are O(log n), not one per blocked day
    const blockedOi = calls.oi.filter((d) => d < cutoff).length;
    expect(blockedOi).toBeLessThanOrEqual(6);
    expect(calls.flow.length).toBeLessThanOrEqual(7);
    expect(await cache.get(TICKER, span[0], "oi-change")).toBeUndefined();
    expect(await cache.get(TICKER, cutoff, "oi-change")).toHaveLength(1);
  });

  it("never fetches future dates and never persists today's rows", async () => {
    const cache = new MemoryCache();
    const { client, calls } = stubClient();
    const span = ["2026-10-21", "2026-10-22", "2026-10-23"];
    const { days } = await loadDailyFootprints(client, cache, TICKER, span, { today: TODAY });
    expect(days.map((d) => d.date)).toEqual(span);
    expect(calls.oi).toEqual(["2026-10-21", "2026-10-22"]);
    expect(calls.flow[0].olderThan).toBe("2026-10-23");
    expect(days[1].oiChanges).toHaveLength(1);
    expect(days[2]).toEqual({ date: "2026-10-23", alerts: [], oiChanges: [], darkPool: [], volumePercentile: undefined, skew: undefined });
    expect(await cache.get(TICKER, "2026-10-21", "oi-change")).toBeDefined();
    expect(await cache.get(TICKER, "2026-10-22", "oi-change")).toBeUndefined();
    expect(await cache.get(TICKER, "2026-10-22", "flow-alerts")).toBeUndefined();
  });

  it("degrades gracefully when the skew / volume endpoints are not entitled", async () => {
    const cache = new MemoryCache();
    const base = stubClient();
    const client: FootprintClient = {
      ...base.client,
      async getRiskReversalSkew() {
        throw new UwAccessError({ status: 403, path: "/skew", code: "volatility_scope_required", message: "no" });
      },
      async getOptionsVolumeHistory() {
        throw new UwAccessError({ status: 403, path: "/options-volume", code: "missing_access", message: "no" });
      },
    };
    const { days, warnings } = await loadDailyFootprints(client, cache, TICKER, dates.slice(0, 2), { today: TODAY });
    expect(days).toHaveLength(2);
    expect(days[0].skew).toBeUndefined();
    expect(days[0].volumePercentile).toBeUndefined();
    expect(warnings.some((w) => w.includes("volatility_scope_required"))).toBe(true);
    expect(warnings.some((w) => w.startsWith("options-volume:"))).toBe(true);
  });
});

describe("buildScoreInput", () => {
  const catalyst: Catalyst = {
    id: "fda:NVDA:2026-10-15:x",
    ticker: "nvda",
    kind: "fda",
    eventDate: "2026-10-15",
    session: "unknown",
    title: "PDUFA",
    source: "test",
  };

  it("produces 5 footprint days and 60 baseline days for a past event", async () => {
    const cache = new MemoryCache();
    const { client, calls } = stubClient();
    const { input, warnings } = await buildScoreInput(client, cache, catalyst, { today: TODAY, otherCatalystsInWindow: 1 });
    expect(warnings).toEqual([]);
    expect(input.ticker).toBe("NVDA");
    expect(input.eventDate).toBe("2026-10-15");
    expect(input.footprintDays.map((d) => d.date)).toEqual(footprintWindow("2026-10-15"));
    expect(input.baselineDays.map((d) => d.date)).toEqual(baselineWindow("2026-10-15"));
    expect(input.footprintDays).toHaveLength(5);
    expect(input.baselineDays).toHaveLength(60);
    expect(input.partialWindow).toBe(false);
    expect(input.otherCatalystsInWindow).toBe(1);
    expect(calls.flow).toHaveLength(1); // one coalesced range for baseline + footprint
    expect(calls.oi).toHaveLength(65);
    expect(calls.skew).toEqual([{ expiry: "2026-10-16", date: "2026-10-14" }]);
    expect(input.footprintDays.every((d) => typeof d.volumePercentile === "number")).toBe(true);
  });

  it("builds a partial window for a future event", async () => {
    const cache = new MemoryCache();
    const { client } = stubClient();
    const future = { ...catalyst, eventDate: "2026-10-27" };
    const { input } = await buildScoreInput(client, cache, future, { today: TODAY });
    expect(input.partialWindow).toBe(true);
    expect(input.footprintDays.map((d) => d.date)).toEqual(["2026-10-20", "2026-10-21", "2026-10-22"]);
    expect(input.baselineDays).toHaveLength(60);
  });
});

describe("loadOutcome", () => {
  const fda: Catalyst = { id: "x", ticker: "NVDA", kind: "fda", eventDate: "2026-10-15", session: "premarket", title: "t", source: "s" };

  it("loads chart-window bars, caches them per date and derives the implied move from T-1 IV", async () => {
    const cache = new MemoryCache();
    const { client, calls } = stubClient();
    const first = await loadOutcome(client, cache, fda, { today: TODAY });
    expect(first.warnings).toEqual([]);
    expect(first.ohlc.map((b) => b.date)).toEqual(tradingDaysBetween(addTradingDays("2026-10-15", -10), "2026-10-20"));
    expect(calls.ohlc).toEqual([{ startDate: addTradingDays("2026-10-15", -10), endDate: "2026-10-20" }]);
    expect(calls.iv).toEqual(["2026-10-14"]);
    expect(first.impliedMovePct).toBe(5.8);
    expect(await cache.get(TICKER, "2026-10-14", "interpolated-iv")).toHaveLength(3);
    expect(await cache.get(TICKER, "2026-10-20", "ohlc")).toMatchObject({ date: "2026-10-20" });

    const second = await loadOutcome(client, cache, fda, { today: TODAY });
    expect(calls.ohlc).toHaveLength(1);
    expect(calls.iv).toHaveLength(1);
    expect(second.ohlc).toEqual(first.ohlc);
  });

  it("prefers the earnings expected move and uses the event date for after-hours IV", async () => {
    const cache = new MemoryCache();
    const { client, calls } = stubClient();
    const earnings: Catalyst = { ...fda, kind: "earnings", session: "afterhours", payload: { expected_move_perc: 3.59 } };
    const a = await loadOutcome(client, cache, earnings, { today: TODAY });
    expect(a.impliedMovePct).toBe(3.59);
    expect(calls.iv).toEqual([]);

    const noMove: Catalyst = { ...earnings, payload: {} };
    const b = await loadOutcome(client, cache, noMove, { today: TODAY });
    expect(calls.iv).toEqual(["2026-10-15"]);
    expect(b.impliedMovePct).toBe(5.8);
  });

  it("skips bars after today and IV dates in the future", async () => {
    const cache = new MemoryCache();
    const { client, calls } = stubClient();
    const upcoming: Catalyst = { ...fda, eventDate: "2026-10-29" };
    const r = await loadOutcome(client, cache, upcoming, { today: TODAY });
    expect(calls.ohlc[0].endDate).toBe(TODAY);
    expect(calls.iv).toEqual([]);
    expect(r.impliedMovePct).toBeUndefined();
    expect(await cache.get(TICKER, TODAY, "ohlc")).toBeUndefined();
  });
});
