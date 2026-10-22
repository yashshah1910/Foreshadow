import { UwClient } from "../src/client";
import type { FetchLike, UwClientOptions } from "../src/http";

export interface RecordedCall {
  url: URL;
  headers: Headers;
}

export interface FakeResponse {
  status?: number;
  body?: unknown;
  text?: string;
  headers?: Record<string, string>;
}

export type Route = (url: URL, index: number) => FakeResponse | undefined;

/** A `fetch` double that records every call and answers from `route`. */
export function fakeFetch(route: Route): { fetchFn: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchFn: FetchLike = async (input, init) => {
    const url = new URL(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, headers });
    const r = route(url, calls.length - 1) ?? { status: 404, body: { message: "no route" } };
    const body = r.text ?? JSON.stringify(r.body ?? { data: [] });
    return new Response(body, {
      status: r.status ?? 200,
      headers: { "content-type": r.text ? "text/plain" : "application/json", ...(r.headers ?? {}) },
    });
  };
  return { fetchFn, calls };
}

export interface TestClient {
  client: UwClient;
  calls: RecordedCall[];
  sleeps: number[];
  clock: { now(): number };
}

/** Client with a fake fetch and a fake clock whose `sleep` advances `now`. */
export function makeClient(route: Route, opts: Partial<UwClientOptions> = {}): TestClient {
  const { fetchFn, calls } = fakeFetch(route);
  const sleeps: number[] = [];
  let t = 1_760_000_000_000;
  const clock = { now: () => t };
  const client = new UwClient({
    apiKey: "test-key",
    fetch: fetchFn,
    now: clock.now,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    ...opts,
  });
  return { client, calls, sleeps, clock };
}

export const dataRoute =
  (body: unknown): Route =>
  () => ({ body: { data: body } });

/** Canonical rows from the UW research report (decimals are strings). */
export const FLOW_ALERT_ROW = {
  alert_rule: "RepeatedHits",
  all_opening_trades: true,
  created_at: "2023-12-12T16:35:52.168490Z",
  delta: 0.5,
  expiry: "2023-12-22",
  expiry_count: 1,
  has_floor: false,
  has_multileg: false,
  has_singleleg: true,
  has_sweep: true,
  issue_type: "Common Stock",
  iv: 0.2,
  open_interest: 1494,
  option_chain: "MSFT231222C00375000",
  price: "4.05",
  strike: "375",
  ticker: "MSFT",
  total_ask_side_prem: "151875",
  total_bid_side_prem: "405",
  total_premium: "186705",
  total_size: 461,
  trade_count: 32,
  type: "call",
  underlying_price: "372.99",
  volume: 461,
  volume_oi_ratio: "0.3086",
};

export const OI_CHANGE_ROW = {
  avg_price: "4.05",
  curr_date: "2023-12-12",
  curr_oi: 1494,
  last_ask: "4.10",
  last_bid: "4.00",
  last_date: "2023-12-11",
  last_fill: "4.05",
  last_oi: 90,
  oi_change: "15.6",
  oi_diff_plain: 1404,
  option_symbol: "MSFT231222C00375000",
  percentage_of_total: "0.12",
  prev_total_premium: "186705",
  rnk: 1,
  trades: 32,
  underlying_symbol: "MSFT",
  volume: 461,
};

export const DARK_POOL_ROW = {
  canceled: false,
  executed_at: "2025-05-02T13:42:12Z",
  ext_hour_sold_codes: null,
  market_center: "L",
  nbbo_ask: "19",
  nbbo_ask_quantity: 100,
  nbbo_bid: "18.99",
  nbbo_bid_quantity: 100,
  premium: "121538.56",
  price: "18.9904",
  sale_cond_codes: null,
  size: 6400,
  ticker: "F",
  tracking_id: 71984388012245,
  trade_code: null,
  trade_settlement: "regular_settlement",
  trf_executed_at: "2025-05-02T13:42:12Z",
  volume: 1200000,
};
