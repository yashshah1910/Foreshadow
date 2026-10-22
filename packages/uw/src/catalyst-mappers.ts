/**
 * Raw UW catalyst rows -> `Catalyst` (and the two non-ticker shapes).
 * Ids are deterministic: `${kind}:${ticker}:${eventDate}:${slug}`.
 */

import type { Catalyst, CatalystSession } from "../../core/src/types";
import type {
  EconomicEvent,
  PotusItem,
  RawCongressTrade,
  RawEarningsRow,
  RawEconomicEvent,
  RawFdaRow,
  RawInsiderTransaction,
  RawPotusEntry,
  RawUnusualCongressTrade,
} from "./types";
import { bool, boolOrNull, catalystId, formatUsd, num, numOpt, strOpt, strOrNull } from "./util";

/** Fraction string ("0.0359") -> percent number (3.59), or null. */
function pct(value: unknown): number | null {
  const n = numOpt(value);
  return n === undefined ? null : Math.round(n * 10_000) / 100;
}

/** FDA calendar row -> kind `fda`. Event date is `start_date` (else `end_date`). */
export function mapFdaRow(row: RawFdaRow): Catalyst | null {
  const ticker = strOpt(row.ticker)?.toUpperCase();
  // target_date is the decision date. A vague one ("2026-Q4", "Late 2026") means the
  // event can't be pinned to a session, so it can't be scored: skip it rather than
  // misdate it with the announcement date.
  const target = strOpt(row.target_date);
  const eventDate = target ? isoDay(target) : (isoDay(row.end_date) ?? isoDay(row.start_date));
  if (!ticker || !eventDate) return null;
  const catalyst = strOpt(row.catalyst) ?? "FDA";
  const drug = strOpt(row.drug) ?? "";
  return {
    id: catalystId("fda", ticker, eventDate, `${catalyst}-${drug}`),
    ticker,
    kind: "fda",
    eventDate,
    session: "unknown",
    title: drug ? `${catalyst}: ${drug}` : catalyst,
    source: "uw:fda-calendar",
    payload: {
      drug,
      catalyst,
      status: strOrNull(row.status),
      indication: strOrNull(row.indication),
      outcome: strOrNull(row.outcome),
      outcome_brief: strOrNull(row.outcome_brief),
      marketcap: numOpt(row.marketcap) ?? null,
      source_link: strOrNull(row.source_link),
      has_options: boolOrNull(row.has_options),
      end_date: strOrNull(row.end_date),
      announced_date: strOrNull(row.start_date),
      description: strOrNull(row.description),
    },
  };
}

/**
 * Earnings row -> kind `earnings`. `report_time` wins over the endpoint the
 * row came from (`postmarket` -> `afterhours`). Percent fields are numbers in
 * percent (expected_move_perc "0.0359" -> 3.59).
 */
export function mapEarningsRow(
  row: RawEarningsRow,
  endpointSession: "premarket" | "afterhours",
  date: string,
): Catalyst | null {
  const ticker = strOpt(row.symbol)?.toUpperCase();
  if (!ticker) return null;
  const eventDate = strOpt(row.report_date) ?? date;
  const session: CatalystSession =
    row.report_time === "premarket"
      ? "premarket"
      : row.report_time === "postmarket"
        ? "afterhours"
        : endpointSession;
  return {
    id: catalystId("earnings", ticker, eventDate, session),
    ticker,
    kind: "earnings",
    eventDate,
    session,
    title: session === "premarket" ? "Earnings (pre-market)" : "Earnings (after hours)",
    source: `uw:earnings-${endpointSession}`,
    payload: {
      expected_move_perc: pct(row.expected_move_perc),
      expected_move: numOpt(row.expected_move) ?? null,
      reaction: pct(row.reaction),
      pre_earnings_close: numOpt(row.pre_earnings_close) ?? null,
      post_earnings_close: numOpt(row.post_earnings_close) ?? null,
      pre_earnings_date: strOrNull(row.pre_earnings_date),
      post_earnings_date: strOrNull(row.post_earnings_date),
      full_name: strOrNull(row.full_name),
      sector: strOrNull(row.sector),
      marketcap: numOpt(row.marketcap) ?? null,
      is_s_p_500: bool(row.is_s_p_500),
      has_options: boolOrNull(row.has_options),
      source: strOrNull(row.source),
      report_time: strOrNull(row.report_time),
      street_mean_est: numOpt(row.street_mean_est) ?? null,
      actual_eps: numOpt(row.actual_eps) ?? null,
    },
  };
}

/** `recent-trades` row -> kind `congress`, session `unknown`. */
export function mapCongressRow(row: RawCongressTrade): Catalyst | null {
  const ticker = strOpt(row.ticker)?.toUpperCase();
  const eventDate = strOpt(row.transaction_date);
  if (!ticker || !eventDate) return null;
  const name = strOpt(row.name) ?? strOpt(row.reporter) ?? "Unknown member";
  const txnType = strOpt(row.txn_type) ?? "";
  const amounts = strOpt(row.amounts) ?? "";
  return {
    id: catalystId("congress", ticker, eventDate, `${name}-${txnType}-${amounts}`),
    ticker,
    kind: "congress",
    eventDate,
    session: "unknown",
    title: [name, txnType, amounts].filter(Boolean).join(" "),
    source: "uw:congress-recent-trades",
    payload: {
      name,
      member_type: typeof row.member_type === "string" ? row.member_type : null,
      txn_type: txnType,
      amounts,
      filed_at_date: strOrNull(row.filed_at_date),
      issuer: strOrNull(row.issuer),
      politician_id: strOrNull(row.politician_id),
      reporter: strOrNull(row.reporter),
      notes: strOrNull(row.notes),
    },
  };
}

/** Premium `unusual-trades` row -> kind `congress` with `payload.tags`. */
export function mapUnusualCongressRow(row: RawUnusualCongressTrade): Catalyst | null {
  const ticker = strOpt(row.ticker)?.toUpperCase();
  const eventDate = strOpt(row.transaction_date);
  if (!ticker || !eventDate) return null;
  const name = strOpt(row.politician_name) ?? "Unknown member";
  const txnType = strOpt(row.transaction_type) ?? "";
  const amount = strOpt(row.amount) ?? "";
  const tags = Array.isArray(row.unusual_activity_tags)
    ? row.unusual_activity_tags.filter((t): t is string => typeof t === "string")
    : [];
  return {
    id: catalystId("congress", ticker, eventDate, `${name}-${txnType}-${amount}`),
    ticker,
    kind: "congress",
    eventDate,
    session: "unknown",
    title: [name, txnType, amount].filter(Boolean).join(" "),
    source: "uw:congress-unusual-trades",
    payload: {
      name,
      txn_type: txnType,
      amounts: amount,
      tags,
      committee_conflict: tags.includes("committee_conflict"),
      uw_id: strOrNull(row.id),
      politician_id: strOrNull(row.politician_id),
      company_name: strOrNull(row.company_name),
      asset: strOrNull(row.asset),
      asset_type: strOrNull(row.asset_type),
      filing_date: strOrNull(row.filing_date),
      description: strOrNull(row.description),
      meta: Array.isArray(row.unusual_activity_meta) ? row.unusual_activity_meta : [],
    },
  };
}

/** Insider transaction row -> kind `insider`. `value` = |amount * price|. */
export function mapInsiderRow(row: RawInsiderTransaction): Catalyst | null {
  const ticker = strOpt(row.ticker)?.toUpperCase();
  const eventDate = strOpt(row.transaction_date);
  if (!ticker || !eventDate) return null;
  const owner = strOpt(row.owner_name) ?? "Unknown insider";
  const code = strOpt(row.transaction_code) ?? "";
  const amount = num(row.amount);
  const price = num(row.price);
  const value = Math.abs(amount * price);
  return {
    id: catalystId("insider", ticker, eventDate, `${owner}-${code}`),
    ticker,
    kind: "insider",
    eventDate,
    session: "unknown",
    title: `${owner} ${code === "P" ? "bought" : "sold"} $${formatUsd(value)}`,
    source: "uw:insider-transactions",
    payload: {
      owner_name: owner,
      officer_title: strOrNull(row.officer_title),
      is_director: bool(row.is_director),
      is_officer: bool(row.is_officer),
      is_ten_percent_owner: bool(row.is_ten_percent_owner),
      transaction_code: code,
      amount,
      price,
      value,
      formtype: strOrNull(row.formtype),
      filing_date: strOrNull(row.filing_date),
      is_10b5_1: bool(row.is_10b5_1),
      shares_owned_after: numOpt(row.shares_owned_after) ?? null,
      accession_no: strOrNull(row.accession_no),
    },
  };
}

/** POTUS schedule entry (not ticker-shaped). */
export function mapPotusRow(row: RawPotusEntry, fallbackDate?: string): PotusItem | null {
  const date = strOpt(row.date) ?? fallbackDate;
  if (!date) return null;
  return {
    date,
    time: strOrNull(row.time),
    type: strOpt(row.type) ?? "President Schedule",
    details: strOrNull(row.details),
    location: strOrNull(row.location),
    url: strOrNull(row.url),
  };
}

/** Economic calendar entry (not ticker-shaped). */
export function mapEconomicRow(row: RawEconomicEvent): EconomicEvent | null {
  const time = strOpt(row.time);
  const event = strOpt(row.event);
  if (!time || !event) return null;
  return {
    time,
    event,
    type: strOpt(row.type) ?? "report",
    forecast: strOrNull(row.forecast),
    prev: strOrNull(row.prev),
    reportedPeriod: strOrNull(row.reported_period),
  };
}

/** Accepts "YYYY-MM-DD" or a timestamp; anything else (e.g. "2026-Q4") is not a usable event date. */
function isoDay(v: string | null | undefined): string | undefined {
  const s = strOpt(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : undefined;
}
