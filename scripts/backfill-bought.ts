/**
 * One-off: split the stored call and put money into what was bought at the
 * asking price (the bets) and what was sold, for every stored score. Scores
 * written before 2026-10-23 only kept every call and put traded, so the
 * flow alerts for each case's chart days (about T-10..T-1) are fetched again
 * from Unusual Whales. Each day's bought share is applied to the stored day
 * totals, so the split always adds up to what the page already shows.
 *
 * Also fills each example trade's side and re-applies `agreeWithMoney` with
 * the bought totals (a lean can turn "mixed", and a "matched" on it "missed").
 *
 *   pnpm tsx scripts/backfill-bought.ts --limit 20          # dry run on 20 scores
 *   pnpm tsx scripts/backfill-bought.ts --write             # every score still missing the split
 *   pnpm tsx scripts/backfill-bought.ts --write --only TSLA,NVDA
 *   pnpm tsx scripts/backfill-bought.ts --write --redo --only TENX # split again
 */
import { createClient } from "@supabase/supabase-js";
import {
  addCalendarDays,
  agreeWithMoney,
  footprintWindow,
  MIXED_THRESHOLD,
  type DailyMetrics,
  type Direction,
  type FlowAlert,
  type StoredBreakdown,
  type Verdict,
} from "@foreshadow/core";
import { UwClient } from "@foreshadow/uw";

process.loadEnvFile?.(".env");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const uwKey = process.env.UW_API_KEY;
if (!url || !key || !uwKey) throw new Error("Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and UW_API_KEY");
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const write = process.argv.includes("--write");
const redo = process.argv.includes("--redo");
const limit = Number(arg("limit")) || Infinity;
const only = arg("only")?.split(",").map((t) => t.trim().toUpperCase());
const db = createClient(url, key, { auth: { persistSession: false } });
const uw = new UwClient({ apiKey: uwKey, requestsPerMinute: 900, maxConcurrent: 6 });

interface Row {
  catalyst_id: string;
  ticker: string;
  event_date: string;
  direction: Direction;
  verdict: Verdict;
  partial_window: boolean;
  breakdown: StoredBreakdown;
}

async function rows(): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 200) {
    let q = db
      .from("scores")
      .select("catalyst_id, ticker, event_date, direction, verdict, partial_window, breakdown")
      .order("catalyst_id")
      .range(from, from + 199);
    if (only) q = q.in("ticker", only);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 200) break;
  }
  // Skip rows already split (a rerun picks up where the last one stopped), unless asked to redo them.
  if (redo) return out;
  return out.filter((r) => r.breakdown?.daily?.some((d) => d.alertCount > 0 && d.boughtCallPremium === undefined) ?? false);
}

/** Every alert in [from, to], walking past the page cap the way the ingest does. */
async function alertsBetween(ticker: string, from: string, to: string): Promise<{ alerts: FlowAlert[]; partialDays: string[] }> {
  const all: FlowAlert[] = [];
  const partialDays: string[] = [];
  let olderThan = addCalendarDays(to, 1);
  for (let guard = 0; guard < 20; guard++) {
    const { alerts, complete } = await uw.getFlowAlertsRange({ ticker, newerThan: from, olderThan });
    const oldest = alerts.reduce<string | null>((m, a) => (m === null || a.tradeDate < m ? a.tradeDate : m), null);
    if (complete || oldest === null) {
      all.push(...alerts);
      break;
    }
    // Days newer than the oldest returned are complete; fetch the rest again.
    all.push(...alerts.filter((a) => a.tradeDate > oldest));
    if (oldest <= from || !alerts.some((a) => a.tradeDate > oldest)) {
      // One day alone passes the cap: its split comes from the part that came back.
      all.push(...alerts.filter((a) => a.tradeDate === oldest));
      partialDays.push(oldest);
      if (oldest <= from) break;
      olderThan = oldest;
      continue;
    }
    olderThan = addCalendarDays(oldest, 1);
  }
  return { alerts: all, partialDays };
}

function split(alerts: FlowAlert[]) {
  const byDay = new Map<string, { call: number; put: number; askCall: number; askPut: number; sides: Map<string, string> }>();
  for (const a of alerts) {
    const d = byDay.get(a.tradeDate) ?? { call: 0, put: 0, askCall: 0, askPut: 0, sides: new Map() };
    if (a.type === "call") d.call += a.premium;
    else d.put += a.premium;
    if (a.side === "ask") {
      if (a.type === "call") d.askCall += a.premium;
      else d.askPut += a.premium;
    }
    d.sides.set(`${a.type}|${a.strike}|${a.expiry}|${Math.round(a.premium)}`, a.side);
    byDay.set(a.tradeDate, d);
  }
  return byDay;
}

async function backfill(r: Row): Promise<{ changed: boolean; from?: Direction; to?: Direction; partialDays: number; unsplit: boolean }> {
  const b = r.breakdown;
  const dates = b.daily.map((d) => d.date).sort();
  // The counted days' trades, with their sides, are still cached as the case page's daily rows; use them
  // first. Unusual Whales fills in the other chart days (its history doesn't reach back to every case).
  const { data: cached, error } = await db.from("footprints").select("trade_date, payload").eq("ticker", r.ticker).eq("endpoint", "daily").in("trade_date", dates);
  if (error) throw error;
  const fromCache = new Map((cached ?? []).map((c) => [String(c.trade_date).slice(0, 10), ((c.payload as { alerts?: FlowAlert[] }).alerts ?? [])]));
  const needUw = b.daily.filter((m) => m.alertCount > 0 && !fromCache.has(m.date)).map((m) => m.date);
  const { alerts: uwAlerts, partialDays } = needUw.length ? await alertsBetween(r.ticker, needUw[0], needUw[needUw.length - 1]) : { alerts: [], partialDays: [] };
  const uwDays = new Set(uwAlerts.map((a) => a.tradeDate));
  const byDay = split([...[...fromCache.values()].flat(), ...uwAlerts.filter((a) => !fromCache.has(a.tradeDate))]);
  const daily: DailyMetrics[] = b.daily.map((m) => {
    if (m.alertCount === 0) return { ...m, boughtCallPremium: 0, boughtPutPremium: 0 };
    // No source for this day: leave it unsplit (pages fall back to every call and put) rather than claim $0 of bets.
    if (!fromCache.has(m.date) && !uwDays.has(m.date)) return m;
    const got = byDay.get(m.date);
    // The bought share of what came back, applied to the stored totals, so the split adds up to the page.
    const boughtCallPremium = got && got.call > 0 ? Math.round(m.callPremium * (got.askCall / got.call)) : 0;
    const boughtPutPremium = got && got.put > 0 ? Math.round(m.putPremium * (got.askPut / got.put)) : 0;
    return { ...m, boughtCallPremium, boughtPutPremium };
  });
  const window = new Set(footprintWindow(r.event_date));
  const fp = daily.filter((m) => window.has(m.date));
  const windowSplit = fp.every((m) => m.boughtCallPremium !== undefined);
  const signals = b.signals.map((s) =>
    s.key === "directionalPremium" && windowSplit
      ? {
          ...s,
          detail: {
            ...s.detail,
            boughtCallPremium: fp.reduce((n, m) => n + (m.boughtCallPremium ?? 0), 0),
            boughtPutPremium: fp.reduce((n, m) => n + (m.boughtPutPremium ?? 0), 0),
          },
        }
      : s,
  );
  const sides = new Map<string, string>();
  for (const [date, d] of byDay) for (const [k, v] of d.sides) sides.set(`${date}|${k}`, v);
  const topAlerts = b.topAlerts.map((t) => {
    const side = sides.get(`${t.tradeDate}|${t.type}|${t.strike}|${t.expiry}|${Math.round(t.premium)}`);
    return side ? { ...t, side: side as "ask" | "bid" | "mid" } : t;
  });
  if (!windowSplit) {
    // Keep the lean and the window totals as they are; only the days and trades that could be split change.
    await save(r, { ...b, daily, topAlerts }, r.direction, r.verdict);
    return { changed: false, partialDays: partialDays.length, unsplit: true };
  }

  // The lean before the money check, from the stored composite, then the check with the bought totals.
  const dir = signals.find((s) => s.key === "directionalPremium")!.detail;
  const oi = signals.find((s) => s.key === "openInterest")?.detail;
  const raw: Direction = b.directionScore > MIXED_THRESHOLD ? "bullish" : b.directionScore < -MIXED_THRESHOLD ? "bearish" : "mixed";
  const direction = agreeWithMoney(raw, dir.boughtCallPremium, dir.boughtPutPremium, dir.netPremiumPerDay ?? 0, oi?.imbalance ?? 0);
  let verdict = r.verdict;
  if (direction !== r.direction && (verdict === "matched" || verdict === "missed")) {
    const moved = b.verdict.realizedMovePct ?? 0;
    const big = Math.abs(moved) >= (b.verdict.impliedMovePct ?? Infinity);
    verdict = big && ((direction === "bullish" && moved > 0) || (direction === "bearish" && moved < 0)) ? "matched" : "missed";
  }
  await save(r, { ...b, daily, signals, topAlerts, verdict: { ...b.verdict, verdict } }, direction, verdict);
  return { changed: direction !== r.direction, from: r.direction, to: direction, partialDays: partialDays.length, unsplit: false };
}

async function save(r: Row, breakdown: StoredBreakdown, direction: Direction, verdict: Verdict): Promise<void> {
  if (!write) return;
  const { error } = await db.from("scores").update({ breakdown, direction, verdict }).eq("catalyst_id", r.catalyst_id);
  if (error) throw error;
}

async function main() {
  const list = (await rows()).slice(0, limit);
  console.log(`${list.length} scores to split${write ? "" : " (dry run)"}`);
  const t0 = Date.now();
  let done = 0;
  let failed = 0;
  let leans = 0;
  let partial = 0;
  let unsplit = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let i = next++; i < list.length; i = next++) {
        const r = list[i];
        try {
          const res = await backfill(r);
          done += 1;
          partial += res.partialDays;
          if (res.unsplit) unsplit += 1;
          if (res.changed) {
            leans += 1;
            console.log(`  ${r.catalyst_id}: ${res.from} → ${res.to}`);
          }
        } catch (err) {
          failed += 1;
          console.warn(`  ${r.catalyst_id}: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
        }
        if ((done + failed) % 100 === 0) console.log(`  [${Math.round((Date.now() - t0) / 1000)}s] ${done + failed}/${list.length}`);
      }
    }),
  );
  console.log(`done: ${done} split (${unsplit} with a counted day no source still had), ${failed} failed, ${leans} leans changed, ${partial} days only partly fetched, ${Math.round((Date.now() - t0) / 1000)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
