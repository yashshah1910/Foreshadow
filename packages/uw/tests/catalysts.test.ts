import { describe, expect, it } from "vitest";
import type { Catalyst, IsoDate } from "../../core/src/types";
import { fetchCatalysts, type CatalystClient } from "../src/catalysts";
import { UwAccessError } from "../src/errors";
import { makeClient } from "./helpers";

describe("catalyst endpoints", () => {
  it("getFdaCalendar maps PDUFA rows", async () => {
    const rows = [
      {
        catalyst: "PDUFA Date",
        description: "Decision expected",
        drug: "Zepbound",
        end_date: "2026-11-05",
        has_options: true,
        indication: "Obesity",
        marketcap: "700000000000",
        notes: null,
        outcome: null,
        outcome_brief: null,
        source_link: "https://example.com",
        start_date: "2026-11-05",
        status: "NDA",
        ticker: "lly",
      },
      { catalyst: "Advisory Committee Meeting", drug: "X", end_date: "2026-11-09", status: "BLA", ticker: "ABCD" },
      { catalyst: "No ticker", drug: "Y", start_date: "2026-11-09", status: "BLA" },
    ];
    const { client, calls } = makeClient(() => ({ body: { data: rows } }));
    const out = await client.getFdaCalendar({ targetDateMin: "2026-11-01", targetDateMax: "2026-11-30" });
    const q = calls[0].url.searchParams;
    expect(calls[0].url.pathname).toBe("/api/market/fda-calendar");
    expect([q.get("target_date_min"), q.get("target_date_max"), q.get("limit")]).toEqual(["2026-11-01", "2026-11-30", "500"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      id: "fda:LLY:2026-11-05:pdufa-date-zepbound",
      ticker: "LLY",
      kind: "fda",
      eventDate: "2026-11-05",
      session: "unknown",
      title: "PDUFA Date: Zepbound",
      payload: { drug: "Zepbound", catalyst: "PDUFA Date", status: "NDA", indication: "Obesity", marketcap: 700000000000, has_options: true, source_link: "https://example.com" },
    });
    expect(out[1].eventDate).toBe("2026-11-09"); // end_date fallback
  });

  it("getEarnings calls both sessions, pages, and maps report_time", async () => {
    const pre = { symbol: "jpm", report_date: "2026-10-14", report_time: "premarket", expected_move_perc: "0.0359", reaction: "0.041", pre_earnings_close: "210.5", post_earnings_close: "219.1", full_name: "JPMorgan", sector: "Financial Services", marketcap: "600000000000", is_s_p_500: true, has_options: true, source: "company" };
    const post = { ...pre, symbol: "NFLX", report_time: "postmarket" };
    const unknown = { ...pre, symbol: "ZZZ", report_time: "unknown" };
    const { client, calls } = makeClient((url, i) => {
      if (url.pathname === "/api/earnings/premarket") {
        return { body: { data: url.searchParams.get("page") === "0" ? Array.from({ length: 100 }, () => pre) : [pre] } };
      }
      return { body: { data: i >= 0 ? [post, unknown] : [] } };
    });
    const out = await client.getEarnings("2026-10-14");
    const paths = calls.map((c) => `${c.url.pathname}?page=${c.url.searchParams.get("page")}&limit=${c.url.searchParams.get("limit")}&date=${c.url.searchParams.get("date")}`);
    expect(paths).toEqual([
      "/api/earnings/premarket?page=0&limit=100&date=2026-10-14",
      "/api/earnings/afterhours?page=0&limit=100&date=2026-10-14",
      "/api/earnings/premarket?page=1&limit=100&date=2026-10-14",
    ]);
    expect(out).toHaveLength(103);
    const jpm = out[0];
    expect(jpm).toMatchObject({
      id: "earnings:JPM:2026-10-14:premarket",
      ticker: "JPM",
      kind: "earnings",
      session: "premarket",
      title: "Earnings (pre-market)",
      payload: { expected_move_perc: 3.59, reaction: 4.1, pre_earnings_close: 210.5, post_earnings_close: 219.1, full_name: "JPMorgan", sector: "Financial Services", marketcap: 600000000000, is_s_p_500: true, has_options: true, source: "company" },
    });
    const nflx = out.find((c) => c.ticker === "NFLX");
    expect(nflx).toMatchObject({ session: "afterhours", title: "Earnings (after hours)", id: "earnings:NFLX:2026-10-14:afterhours" });
    expect(out.find((c) => c.ticker === "ZZZ")?.session).toBe("afterhours"); // endpoint fallback
  });

  it("getCongressTrades and getUnusualCongressTrades map to kind congress", async () => {
    const recent = { amounts: "$15,001 - $50,000", filed_at_date: "2026-10-20", is_active: true, issuer: "spouse", member_type: "house", name: "Nancy Pelosi", politician_id: "p1", reporter: "Pelosi, Nancy", ticker: "NVDA", transaction_date: "2026-10-15", txn_type: "Buy" };
    const unusual = { id: "u1", politician_id: "p1", politician_name: "Nancy Pelosi", ticker: "NVDA", company_name: "NVIDIA", asset: "NVIDIA Corp - Common Stock", asset_type: "stock", transaction_type: "Buy", transaction_date: "2026-10-15", filing_date: "2026-10-20", amount: "$15,001 - $50,000", unusual_activity_tags: ["committee_conflict", "unusually_large_trade"], unusual_activity_meta: [] };
    const { client, calls } = makeClient((url) => ({ body: { data: url.pathname.endsWith("unusual-trades") ? [unusual] : [recent] } }));
    const a = await client.getCongressTrades({ date: "2026-10-21", ticker: "nvda" });
    const q = calls[0].url.searchParams;
    expect(calls[0].url.pathname).toBe("/api/congress/recent-trades");
    expect([q.get("date"), q.get("limit"), q.get("ticker")]).toEqual(["2026-10-21", "200", "NVDA"]);
    expect(a[0]).toMatchObject({
      id: "congress:NVDA:2026-10-15:nancy-pelosi-buy-15-001-50-000",
      kind: "congress",
      session: "unknown",
      title: "Nancy Pelosi Buy $15,001 - $50,000",
      payload: { name: "Nancy Pelosi", member_type: "house", txn_type: "Buy", amounts: "$15,001 - $50,000", filed_at_date: "2026-10-20", issuer: "spouse", politician_id: "p1" },
    });
    const b = await client.getUnusualCongressTrades({ types: ["committee_conflict"] });
    expect(calls[1].url.searchParams.get("types")).toBe("committee_conflict");
    expect(calls[1].url.searchParams.get("page")).toBe("1");
    expect(b[0].id).toBe(a[0].id); // same trade -> same id across both feeds
    expect(b[0].payload).toMatchObject({ tags: ["committee_conflict", "unusually_large_trade"], committee_conflict: true });
  });

  it("getUnusualCongressTrades surfaces the premium 403 as UwAccessError", async () => {
    const { client } = makeClient(() => ({ status: 403, body: { code: "politics_scope_required", message: "premium" } }));
    await expect(client.getUnusualCongressTrades()).rejects.toBeInstanceOf(UwAccessError);
  });

  it("getInsiderTransactions pages, sends the filter params and titles buys/sells", async () => {
    const sale = { owner_name: "Jensen Huang", officer_title: "CEO", is_director: true, is_officer: true, is_ten_percent_owner: false, transaction_code: "S", amount: -35921, price: "180.25", formtype: "4", filing_date: "2026-10-17", is_10b5_1: true, ticker: "NVDA", transaction_date: "2026-10-15" };
    const buy = { ...sale, owner_name: "Jane Doe", transaction_code: "P", amount: 10000, price: "100", is_10b5_1: false };
    const { client, calls } = makeClient((url) => ({
      body: { data: url.searchParams.get("page") === "0" ? Array.from({ length: 500 }, () => sale) : [buy] },
    }));
    const out = await client.getInsiderTransactions({ startDate: "2026-10-01", endDate: "2026-10-21", minValue: 1_000_000 });
    expect(calls).toHaveLength(2);
    expect(decodeURIComponent(calls[0].url.search)).toBe(
      "?start_date=2026-10-01&end_date=2026-10-21&min_value=1000000&transaction_codes[]=P&transaction_codes[]=S&common_stock_only=true&limit=500&page=0",
    );
    expect(out).toHaveLength(501);
    expect(out[0]).toMatchObject({
      id: "insider:NVDA:2026-10-15:jensen-huang-s",
      kind: "insider",
      title: "Jensen Huang sold $6,474,760",
      payload: { owner_name: "Jensen Huang", officer_title: "CEO", is_director: true, is_officer: true, is_ten_percent_owner: false, transaction_code: "S", amount: -35921, price: 180.25, value: 6474760.25, formtype: "4", filing_date: "2026-10-17", is_10b5_1: true },
    });
    expect(out[500].title).toBe("Jane Doe bought $1,000,000");
  });

  it("getPotusSchedule and getEconomicCalendar return the non-ticker shapes", async () => {
    const { client, calls } = makeClient((url) =>
      url.pathname === "/api/potus/schedule"
        ? { body: { data: [{ coverage: "Closed Press", date: "2026-10-22", details: "Briefing", location: "Oval Office", time: "2026-10-22T14:00:00Z", type: "President Schedule", url: null, video_url: null }] } }
        : { body: { data: [{ event: "CPI", forecast: null, prev: "0.0%", reported_period: "September", time: "2026-10-22T12:30:00Z", type: "report" }] } },
    );
    expect(await client.getPotusSchedule("2026-10-22")).toEqual([
      { date: "2026-10-22", time: "2026-10-22T14:00:00Z", type: "President Schedule", details: "Briefing", location: "Oval Office", url: null },
    ]);
    expect(calls[0].url.searchParams.get("date")).toBe("2026-10-22");
    expect(await client.getEconomicCalendar()).toEqual([
      { time: "2026-10-22T12:30:00Z", event: "CPI", type: "report", forecast: null, prev: "0.0%", reportedPeriod: "September" },
    ]);
    expect(calls[1].url.search).toBe("");
  });
});

function cat(kind: Catalyst["kind"], ticker: string, eventDate: IsoDate, slug = "x"): Catalyst {
  return { id: `${kind}:${ticker}:${eventDate}:${slug}`, ticker, kind, eventDate, session: "unknown", title: slug, source: "test" };
}

describe("fetchCatalysts", () => {
  function stub() {
    const calls: { method: string; arg: unknown }[] = [];
    const client: CatalystClient = {
      async getFdaCalendar(p) {
        calls.push({ method: "fda", arg: p });
        return [cat("fda", "LLY", "2026-10-15"), cat("fda", "LLY", "2026-10-15"), cat("fda", "ABCD", "2026-12-01")];
      },
      async getEarnings(date) {
        calls.push({ method: "earnings", arg: date });
        return [cat("earnings", "JPM", date, "premarket")];
      },
      async getCongressTrades(p) {
        calls.push({ method: "congress", arg: p?.date });
        if (p?.date === "2026-10-16") {
          return [cat("congress", "NVDA", "2026-10-16", "a"), cat("congress", "NVDA", "2026-10-14", "b"), cat("congress", "MSFT", "2026-10-13", "c")];
        }
        return [cat("congress", "AAPL", "2026-10-13", "d"), cat("congress", "AAPL", "2026-10-09", "e")];
      },
      async getInsiderTransactions(p) {
        calls.push({ method: "insider", arg: p });
        return [cat("insider", "NVDA", "2026-10-15"), cat("insider", "NVDA", "2026-10-01")];
      },
    };
    return { client, calls };
  }

  it("dedupes by id, filters to the range, walks congress backwards and sorts", async () => {
    const { client, calls } = stub();
    const out = await fetchCatalysts(client, { from: "2026-10-12", to: "2026-10-16", kinds: ["fda", "earnings", "congress", "insider", "economic", "potus"] });
    expect(calls.filter((c) => c.method === "earnings").map((c) => c.arg)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(calls.filter((c) => c.method === "congress").map((c) => c.arg)).toEqual(["2026-10-16", "2026-10-13"]);
    expect(calls.filter((c) => c.method === "insider")[0].arg).toEqual({ startDate: "2026-10-12", endDate: "2026-10-16", minValue: undefined });
    expect(out.map((c) => c.id)).toEqual([
      "earnings:JPM:2026-10-12:premarket",
      "congress:AAPL:2026-10-13:d",
      "earnings:JPM:2026-10-13:premarket",
      "congress:MSFT:2026-10-13:c",
      "earnings:JPM:2026-10-14:premarket",
      "congress:NVDA:2026-10-14:b",
      "earnings:JPM:2026-10-15:premarket",
      "fda:LLY:2026-10-15:x",
      "insider:NVDA:2026-10-15:x",
      "earnings:JPM:2026-10-16:premarket",
      "congress:NVDA:2026-10-16:a",
    ]);
    expect(new Set(out.map((c) => c.kind))).toEqual(new Set(["fda", "earnings", "congress", "insider"]));
  });

  it("only calls the requested kinds", async () => {
    const { client, calls } = stub();
    const out = await fetchCatalysts(client, { from: "2026-10-15", to: "2026-10-15", kinds: ["fda"] });
    expect(calls.map((c) => c.method)).toEqual(["fda"]);
    expect(out.map((c) => c.id)).toEqual(["fda:LLY:2026-10-15:x"]);
  });
});
