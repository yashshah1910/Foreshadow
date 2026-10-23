/**
 * One-off: rewrite cached open-interest days (`footprints`, endpoint
 * `oi-change`) as the per-day totals the scorer reads (see
 * `compactOiChanges`), one ticker at a time so no query runs long. Scores
 * computed from the compact rows are identical; the per-contract rows were
 * never read.
 *
 *   pnpm tsx scripts/compact-oi-cache.ts --limit 50 # dry run on the first 50 tickers
 *   pnpm tsx scripts/compact-oi-cache.ts --write    # rewrite the rows
 */
import { createClient } from "@supabase/supabase-js";
import type { OiChange } from "@foreshadow/core";
import { compactOiChanges } from "../packages/uw/src/footprint";

process.loadEnvFile?.(".env");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY");
const write = process.argv.includes("--write");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const db = createClient(url, key, { auth: { persistSession: false } });

async function tickers(): Promise<string[]> {
  const out = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("footprints").select("ticker").eq("endpoint", "oi-change").order("ticker").order("trade_date").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) out.add(r.ticker as string);
    if (!data || data.length < 1000) break;
  }
  return [...out];
}

async function compactTicker(ticker: string): Promise<{ rows: number; before: number; after: number }> {
  let rows = 0;
  let before = 0;
  let after = 0;
  // A few days per read keeps each query small even for the busiest tickers.
  const { data: days, error } = await db.from("footprints").select("trade_date").eq("ticker", ticker).eq("endpoint", "oi-change");
  if (error) throw error;
  const dates = (days ?? []).map((d) => String(d.trade_date).slice(0, 10));
  for (let i = 0; i < dates.length; i += 20) {
    const { data, error: e2 } = await db
      .from("footprints")
      .select("trade_date, payload, fetched_at")
      .eq("ticker", ticker)
      .eq("endpoint", "oi-change")
      .in("trade_date", dates.slice(i, i + 20));
    if (e2) throw e2;
    const updates = [];
    for (const r of data ?? []) {
      const payload = r.payload as OiChange[];
      if (!Array.isArray(payload) || payload.length <= 4) continue;
      const compact = compactOiChanges(payload);
      rows += 1;
      before += JSON.stringify(payload).length;
      after += JSON.stringify(compact).length;
      updates.push({ ticker, trade_date: r.trade_date, endpoint: "oi-change", payload: compact, fetched_at: r.fetched_at });
    }
    if (write && updates.length) {
      const { error: e3 } = await db.from("footprints").upsert(updates, { onConflict: "ticker,trade_date,endpoint" });
      if (e3) throw e3;
    }
  }
  return { rows, before, after };
}

async function main() {
  const list = (await tickers()).slice(0, limit);
  console.log(`${list.length} tickers with cached open interest${write ? "" : " (dry run)"}`);
  const total = { rows: 0, before: 0, after: 0, failed: 0 };
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let i = next++; i < list.length; i = next++) {
        try {
          const r = await compactTicker(list[i]);
          total.rows += r.rows;
          total.before += r.before;
          total.after += r.after;
        } catch (err) {
          total.failed += 1;
          console.warn(`  ${list[i]}: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (i % 200 === 0) console.log(`  ${i}/${list.length} tickers, ${total.rows} days, ${(total.before / 1e6).toFixed(0)} MB → ${(total.after / 1e6).toFixed(1)} MB`);
      }
    }),
  );
  console.log(`done: ${total.rows} days compacted, ${(total.before / 1e6).toFixed(0)} MB → ${(total.after / 1e6).toFixed(1)} MB of JSON; ${total.failed} tickers failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
