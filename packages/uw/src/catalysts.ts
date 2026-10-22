/**
 * Catalyst discovery across the UW calendar endpoints.
 */

import type { Catalyst, CatalystKind, IsoDate } from "../../core/src/types";
import { tradingDaysBetween } from "../../core/src/windows";
import type { UwClient } from "./client";

export type CatalystClient = Pick<
  UwClient,
  "getFdaCalendar" | "getEarnings" | "getCongressTrades" | "getInsiderTransactions"
>;

export interface FetchCatalystsParams {
  from: IsoDate;
  to: IsoDate;
  /** Only `fda`, `earnings`, `congress` and `insider` are ticker-shaped; others are ignored. */
  kinds: CatalystKind[];
  /** Minimum insider transaction value in USD (default $1M). */
  minInsiderValue?: number;
}

const MAX_CONGRESS_WALK = 60;

/**
 * Every catalyst with `from <= eventDate <= to`, de-duplicated by id and sorted
 * by event date then ticker. Request cost: FDA one call; earnings two calls
 * per trading day in range; congress one call per distinct transaction date
 * walked backwards from `to`; insider one call per 500 rows.
 */
export async function fetchCatalysts(client: CatalystClient, params: FetchCatalystsParams): Promise<Catalyst[]> {
  const { from, to } = params;
  const kinds = new Set(params.kinds);
  const tasks: Promise<Catalyst[]>[] = [];
  if (kinds.has("fda")) tasks.push(client.getFdaCalendar({ targetDateMin: from, targetDateMax: to }));
  if (kinds.has("earnings")) {
    tasks.push(Promise.all(tradingDaysBetween(from, to).map((d) => client.getEarnings(d))).then((r) => r.flat()));
  }
  if (kinds.has("congress")) tasks.push(walkCongress(client, from, to));
  if (kinds.has("insider")) {
    tasks.push(client.getInsiderTransactions({ startDate: from, endDate: to, minValue: params.minInsiderValue }));
  }
  const byId = new Map<string, Catalyst>();
  for (const c of (await Promise.all(tasks)).flat()) {
    if (c.eventDate < from || c.eventDate > to) continue;
    if (!byId.has(c.id)) byId.set(c.id, c);
  }
  return [...byId.values()].sort(
    (a, b) => a.eventDate.localeCompare(b.eventDate) || a.ticker.localeCompare(b.ticker) || a.id.localeCompare(b.id),
  );
}

/**
 * `recent-trades` has no page parameter: it returns up to 200 trades with
 * `transaction_date <= date`. Walk `date` back to the oldest row of each page
 * until a row older than `from` appears or no progress is made.
 */
async function walkCongress(client: CatalystClient, from: IsoDate, to: IsoDate): Promise<Catalyst[]> {
  const out: Catalyst[] = [];
  let date = to;
  for (let i = 0; i < MAX_CONGRESS_WALK; i++) {
    const rows = await client.getCongressTrades({ date });
    if (rows.length === 0) break;
    let oldest = date;
    for (const row of rows) {
      if (row.eventDate < oldest) oldest = row.eventDate;
      if (row.eventDate >= from && row.eventDate <= to) out.push(row);
    }
    if (oldest < from || oldest === date) break;
    date = oldest;
  }
  return out;
}
