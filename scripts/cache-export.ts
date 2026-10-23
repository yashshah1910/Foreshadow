/**
 * Recovery helper for the `footprints` cache. Exports the rows pages and
 * upcoming scoring need to NDJSON (every daily summary, price, IV, volume,
 * skew and open-interest day; flow alerts and dark pool only for tickers
 * with news from 10 days ago to 21 days ahead), and imports them back.
 *
 *   pnpm tsx scripts/cache-export.ts export <dir>
 *   pnpm tsx scripts/cache-export.ts import <dir>
 */
import { createClient } from "@supabase/supabase-js";
import { createReadStream, createWriteStream, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import type { DailyFootprint } from "@foreshadow/core";
import { pageFootprint } from "../packages/uw/src/footprint";

process.loadEnvFile?.(".env");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY");
const db = createClient(url, key, { auth: { persistSession: false } });
const [, , mode, dir] = process.argv;
if (!dir || (mode !== "export" && mode !== "import")) throw new Error("usage: cache-export.ts export|import <dir>");

const ALL = ["daily", "ohlc", "interpolated-iv", "options-volume", "skew", "oi-change"];
const UPCOMING_ONLY = ["flow-alerts", "darkpool"];
const COLUMNS = "ticker, trade_date, endpoint, payload, fetched_at";

function shift(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function upcomingTickers(): Promise<string[]> {
  const out = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("catalysts").select("ticker").gte("event_date", shift(-10)).lte("event_date", shift(21)).order("id").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) out.add(r.ticker as string);
    if (!data || data.length < 1000) break;
  }
  return [...out].sort();
}

async function allTickers(endpoint: string): Promise<string[]> {
  const out = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("footprints").select("ticker").eq("endpoint", endpoint).order("ticker").order("trade_date").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) out.add(r.ticker as string);
    if (!data || data.length < 1000) break;
  }
  return [...out];
}

async function exportRows() {
  mkdirSync(dir, { recursive: true });
  const upcoming = await upcomingTickers();
  console.log(`${upcoming.length} tickers with news from ${shift(-10)} to ${shift(21)}`);
  for (const endpoint of [...ALL, ...UPCOMING_ONLY]) {
    const tickers = UPCOMING_ONLY.includes(endpoint) ? upcoming : await allTickers(endpoint);
    const out = createWriteStream(join(dir, `${endpoint}.ndjson`));
    let rows = 0;
    let next = 0;
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        for (let i = next++; i < tickers.length; i = next++) {
          for (let from = 0; ; from += 40) {
            const { data, error } = await db.from("footprints").select(COLUMNS).eq("endpoint", endpoint).eq("ticker", tickers[i]).order("trade_date").range(from, from + 39);
            if (error) throw new Error(`${endpoint} ${tickers[i]}: ${error.message}`);
            for (const r of data ?? []) out.write(JSON.stringify(r) + "\n");
            rows += data?.length ?? 0;
            if (!data || data.length < 40) break;
          }
        }
      }),
    );
    await new Promise((resolve) => out.end(resolve));
    console.log(`  ${endpoint}: ${rows} rows from ${tickers.length} tickers`);
  }
}

async function importRows() {
  for (const endpoint of [...ALL, ...UPCOMING_ONLY]) {
    let batch: unknown[] = [];
    let bytes = 0;
    let rows = 0;
    const flush = async () => {
      if (!batch.length) return;
      const { error } = await db.from("footprints").upsert(batch, { onConflict: "ticker,trade_date,endpoint" });
      if (error) throw new Error(`${endpoint}: ${error.message}`);
      rows += batch.length;
      batch = [];
      bytes = 0;
    };
    const lines = createInterface({ input: createReadStream(join(dir, `${endpoint}.ndjson`)) });
    for await (const line of lines) {
      if (!line) continue;
      const row = JSON.parse(line) as { endpoint: string; payload: unknown };
      // Daily rows go back trimmed to what pages read (see pageFootprint).
      if (row.endpoint === "daily") row.payload = pageFootprint(row.payload as DailyFootprint);
      batch.push(row);
      bytes += line.length;
      if (batch.length >= 200 || bytes > 1_500_000) await flush();
    }
    await flush();
    console.log(`  ${endpoint}: ${rows} rows imported`);
  }
}

(mode === "export" ? exportRows() : importRows()).catch((err) => {
  console.error(err);
  process.exit(1);
});
