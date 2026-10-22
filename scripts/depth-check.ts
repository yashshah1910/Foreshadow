/**
 * UW history-depth check: the spec's "hour one" test.
 *
 *   pnpm uw:check            # uses AAPL
 *   pnpm uw:check NVDA
 *
 * Probes each endpoint the scorer needs at several look-backs and reports
 * which dates your key can reach, a parsed sample row per endpoint, and the
 * rate-limit headers. Reads UW_API_KEY from .env; never prints the key.
 * Costs roughly 30 requests.
 */

import { UwClient, UwAccessError, UwAuthError, UwApiError } from "../packages/uw/src/index";
import { addTradingDays, nextTradingDay, todayIso, isTradingDay, previousTradingDay } from "../packages/core/src/index";

try {
  process.loadEnvFile?.(".env");
} catch {
  // no .env: rely on the shell environment
}

const key = process.env.UW_API_KEY?.trim();
if (!key) {
  console.error("UW_API_KEY is not set. Add it to .env (copy .env.example) and run again.");
  process.exit(1);
}

const ticker = (process.argv[2] ?? "AAPL").toUpperCase();
const today = todayIso();
const lastSession = isTradingDay(today) ? previousTradingDay(today) : previousTradingDay(nextTradingDay(today));
const uw = new UwClient({ apiKey: key });

type Outcome = { ok: true; rows: number; sample?: string } | { ok: false; reason: string };

async function probe(fn: () => Promise<unknown[]>, describe?: (row: unknown) => string): Promise<Outcome> {
  try {
    const rows = await fn();
    return { ok: true, rows: rows.length, sample: rows.length && describe ? describe(rows[0]) : undefined };
  } catch (err) {
    if (err instanceof UwAuthError) {
      console.error(`\nUW rejected the key (401: ${err.message}). Check UW_API_KEY in .env.`);
      process.exit(1);
    }
    if (err instanceof UwAccessError) return { ok: false, reason: err.isHistoricLookback ? "outside plan history" : `no access (${err.code ?? err.status})` };
    if (err instanceof UwApiError) return { ok: false, reason: `HTTP ${err.status}: ${err.message.slice(0, 80)}` };
    return { ok: false, reason: err instanceof Error ? err.message.slice(0, 90) : String(err) };
  }
}

function cell(o: Outcome): string {
  return o.ok ? `ok (${o.rows})` : `✗ ${o.reason}`;
}

const pick = (r: unknown) => r as Record<string, unknown>;

async function main() {
  console.log(`UW depth check · ${ticker} · today ${today} · last full session ${lastSession}\n`);

  // ---- Footprint endpoints across look-backs -------------------------------
  const lookbacks = [1, 5, 30, 65, 130, 260, 400];
  console.log("sessions back  date        flow-alerts(≥$500K)  oi-change        darkpool(≥$1M)");
  let deepestFlow: string | null = null;
  let deepestOi: string | null = null;
  const samples: Record<string, string | undefined> = {};
  for (const n of lookbacks) {
    const d = n === 1 ? lastSession : addTradingDays(lastSession, -(n - 1));
    const [flow, oi, dp] = await Promise.all([
      probe(
        () => uw.getFlowAlerts({ ticker, newerThan: d, olderThan: nextTradingDay(d), minPremium: 500_000 }),
        (r) => {
          const a = pick(r);
          return `${a.type} $${a.strike} ${a.expiry} · $${Math.round(Number(a.premium)).toLocaleString()} · ${a.side} side${a.isSweep ? " · sweep" : ""} · ${a.executedAt}`;
        },
      ),
      probe(
        () => uw.getOiChange(ticker, d),
        (r) => {
          const o = pick(r);
          return `${o.type} $${o.strike} ${o.expiry} · OI ${o.prevOi} → ${o.curOi} (${Number(o.oiChange) >= 0 ? "+" : ""}${o.oiChange})`;
        },
      ),
      probe(
        () => uw.getDarkPool(ticker, d, { minPremium: 1_000_000 }),
        (r) => {
          const p = pick(r);
          return `${p.size} @ $${p.price} = $${Math.round(Number(p.notional)).toLocaleString()} · ${p.executedAt}`;
        },
      ),
    ]);
    if (flow.ok) deepestFlow = d;
    if (oi.ok) deepestOi = d;
    samples.flow ??= flow.ok ? flow.sample : undefined;
    samples.oi ??= oi.ok ? oi.sample : undefined;
    samples.dp ??= dp.ok ? dp.sample : undefined;
    console.log(`${String(n).padStart(13)}  ${d}  ${cell(flow).padEnd(19)}  ${cell(oi).padEnd(15)}  ${cell(dp)}`);
  }

  // ---- One-shot endpoints -----------------------------------------------------
  console.log("\nother endpoints");
  const ohlcStart = addTradingDays(lastSession, -399);
  const checks: [string, () => Promise<unknown[]>, ((r: unknown) => string)?][] = [
    [`ohlc/1d ${ohlcStart} → ${lastSession}`, () => uw.getOhlcDaily(ticker, { startDate: ohlcStart, endDate: lastSession }), (r) => `${pick(r).date} close ${pick(r).close}`],
    ["options-volume (500 days)", () => uw.getOptionsVolumeHistory(ticker, { limit: 500 }), (r) => `${pick(r).date} total ${pick(r).totalVolume}`],
    ["unusualness (today)", async () => [await uw.getUnusualness(ticker)], (r) => `${pick(r).date} option pctile ${pick(r).optVolPctile}`],
    ["interpolated-iv (65 sessions ago)", () => uw.getInterpolatedIv(ticker, addTradingDays(lastSession, -64)), (r) => `${pick(r).days}d · implied move ${Number(pick(r).impliedMovePct).toFixed(2)}%`],
    ["historical-risk-reversal-skew (1Y)", () => uw.getRiskReversalSkew(ticker, { expiry: thirdFridayAfter(today) }), (r) => `${pick(r).date} skew ${pick(r).skew}`],
    ["fda-calendar (next 60 days)", () => uw.getFdaCalendar({ targetDateMin: today, targetDateMax: addTradingDays(today, 42) }), (r) => `${pick(r).ticker} ${pick(r).eventDate} ${pick(r).title}`],
    [`earnings (${lastSession})`, () => uw.getEarnings(lastSession), (r) => `${pick(r).ticker} ${pick(r).title}`],
    ["congress recent-trades", () => uw.getCongressTrades({ limit: 20 }), (r) => `${pick(r).ticker} ${pick(r).eventDate} ${pick(r).title}`],
    ["insider transactions (last 10 sessions)", () => uw.getInsiderTransactions({ startDate: addTradingDays(lastSession, -9), endDate: lastSession }), (r) => `${pick(r).ticker} ${pick(r).title}`],
    ["economic-calendar", () => uw.getEconomicCalendar(), (r) => `${pick(r).time} ${pick(r).event}`],
    ["potus/schedule", () => uw.getPotusSchedule(), (r) => `${pick(r).date} ${String(pick(r).details ?? pick(r).type).slice(0, 60)}`],
    ["congress unusual-trades (premium)", () => uw.getUnusualCongressTrades({ limit: 5 }), (r) => `${pick(r).ticker} ${pick(r).title}`],
  ];
  for (const [label, fn, describe] of checks) {
    const o = await probe(fn, describe);
    console.log(`  ${label.padEnd(42)} ${cell(o)}${o.ok && o.sample ? `\n  ${"".padEnd(42)} e.g. ${o.sample}` : ""}`);
  }

  // ---- Samples + verdict --------------------------------------------------------
  console.log("\nparsed samples (check strikes, sides and amounts look sane)");
  console.log(`  flow alert   ${samples.flow ?? "none returned"}`);
  console.log(`  oi change    ${samples.oi ?? "none returned"}`);
  console.log(`  dark pool    ${samples.dp ?? "none returned"}`);

  const u = uw.usage;
  console.log(`\nrate limit   ${u.minuteRemaining ?? "?"} left this minute · ${u.dailyCount ?? "?"} used of ${u.dailyLimit ?? "?"} today`);

  const needed = addTradingDays(lastSession, -65);
  console.log(`\nverdict      a full 60-session baseline for an event today needs data back to ${needed}`);
  console.log(`             deepest flow-alerts probe that worked: ${deepestFlow ?? "none"}`);
  console.log(`             deepest oi-change probe that worked:   ${deepestOi ?? "none"}`);
  if (deepestFlow && deepestFlow <= needed && deepestOi && deepestOi <= needed) {
    console.log("             → full baseline available. Backfill with: pnpm ingest --mode backfill --days 90 --loop");
  } else {
    console.log("             → history is shorter than 65 sessions; the loader will shrink the baseline and flag events.");
  }
}

function thirdFridayAfter(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  for (let i = 0; i < 3; i++) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + i;
    const first = new Date(Date.UTC(y, m, 1));
    const day = 1 + ((5 - first.getUTCDay() + 7) % 7) + 14;
    const tf = new Date(Date.UTC(y, m, day)).toISOString().slice(0, 10);
    if (tf > date) return tf;
  }
  return date;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
