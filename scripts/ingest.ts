/**
 * Local ingest / backfill against your Supabase project with your UW key.
 *
 *   pnpm ingest --mode backfill --days 90 --loop
 *   pnpm ingest --mode radar
 *   pnpm ingest --mode backfill --days 90 --kinds fda,earnings --dry-run
 *
 * Flags: --kinds fda,earnings,…  --min-cap 2000000000  --max N  --concurrency N
 *        --rpm N (UW requests/minute, default 120)  --dry-run  --loop  --verbose
 *
 * Reads .env (Node 20.12+). `--loop` keeps running batches until nothing is
 * left to score, which is how you backfill a full leaderboard once.
 */

import { createClient } from "@supabase/supabase-js";
import { UwClient } from "../packages/uw/src/index";
import { runIngest, type IngestMode } from "../lib/ingest";
import type { CatalystKind } from "../packages/core/src/index";

try {
  process.loadEnvFile?.(".env");
} catch {
  // no .env file; rely on the environment
}

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) {
    const [k, v] = a.slice(2).split("=");
    args.set(k, v ?? (process.argv[i + 1]?.startsWith("--") ? "true" : (process.argv[++i] ?? "true")));
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const uwKey = process.env.UW_API_KEY;
if (!url || !service) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required in .env");
if (!uwKey) throw new Error("UW_API_KEY is required");

const db = createClient(url, service, { auth: { persistSession: false } });
const rpm = Number(args.get("rpm")) || Number(process.env.UW_REQUESTS_PER_MINUTE) || 120;
const verbose = args.get("verbose") === "true";
const uw = new UwClient({ apiKey: uwKey, requestsPerMinute: rpm, logger: verbose ? (m) => console.log("  uw:", m) : undefined });
const mode = (args.get("mode") ?? "daily") as IngestMode;
const loop = args.get("loop") === "true";
const maxEvents = Number(args.get("max")) || (mode === "radar" ? 12 : 8);
const lookbackDays = Number(args.get("days")) || undefined;
const kinds = args.get("kinds")?.split(",").map((k) => k.trim()).filter(Boolean) as CatalystKind[] | undefined;
const minEarningsMarketCap = args.get("min-cap") ? Number(args.get("min-cap")) : undefined;
const dryRun = args.get("dry-run") === "true";
const concurrency = Number(args.get("concurrency")) || 1;

async function main() {
  for (let round = 1; ; round++) {
    console.log(`round ${round} (${mode})`);
    const report = await runIngest(db, uw, {
      mode,
      maxEvents,
      lookbackDays,
      kinds,
      minEarningsMarketCap,
      dryRun,
      concurrency,
      log: (m) => console.log(`  [${new Date().toLocaleTimeString()}] ${m}`),
    });
    console.log(JSON.stringify({ ...report, warnings: report.warnings.length, errors: report.errors.length }, null, 2));
    for (const w of report.warnings) console.log("  warning:", w);
    for (const e of report.errors) console.log("  error:", e);
    if (dryRun || !loop || report.candidates === 0 || report.scored === 0) break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
