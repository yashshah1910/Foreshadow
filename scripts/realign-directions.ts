/**
 * One-off: apply `agreeWithMoney` to scores already stored, from their saved
 * breakdowns (no Unusual Whales calls). A lean that contradicts the money
 * becomes "mixed", and a "matched" verdict on it becomes "missed" (a mixed
 * lean can never match).
 *
 *   pnpm tsx scripts/realign-directions.ts            # dry run: counts only
 *   pnpm tsx scripts/realign-directions.ts --write    # update the rows
 */
import { createClient } from "@supabase/supabase-js";
import { agreeWithMoney, type Direction, type StoredBreakdown, type Verdict } from "@foreshadow/core";

process.loadEnvFile?.(".env");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY");
const write = process.argv.includes("--write");
const db = createClient(url, key, { auth: { persistSession: false } });

interface Row {
  catalyst_id: string;
  direction: Direction;
  verdict: Verdict;
  signals: StoredBreakdown["signals"] | null;
}

async function main() {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("scores")
      .select("catalyst_id, direction, verdict, signals:breakdown->signals")
      .order("catalyst_id")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }
  const changes = rows.flatMap((r) => {
    const detail = r.signals?.find((s) => s.key === "directionalPremium")?.detail;
    if (!detail) return [];
    const oi = r.signals?.find((s) => s.key === "openInterest")?.detail;
    const direction = agreeWithMoney(r.direction, detail.callPremium ?? 0, detail.putPremium ?? 0, detail.netPremiumPerDay ?? 0, oi?.imbalance ?? 0);
    if (direction === r.direction) return [];
    const verdict: Verdict = r.verdict === "matched" ? "missed" : r.verdict;
    return [{ id: r.catalyst_id, from: r.direction, direction, verdict, wasMatched: r.verdict === "matched" }];
  });
  console.log(`${rows.length} scores; ${changes.length} leans contradict the money; ${changes.filter((c) => c.wasMatched).length} of those were "matched"`);
  for (const c of changes.slice(0, 12)) console.log(`  ${c.id}: ${c.from} → ${c.direction}${c.wasMatched ? " (matched → missed)" : ""}`);
  if (!write) return;
  for (const c of changes) {
    const { data, error } = await db.from("scores").select("breakdown").eq("catalyst_id", c.id).single();
    if (error) throw error;
    const breakdown = data.breakdown as StoredBreakdown;
    breakdown.verdict = { ...breakdown.verdict, verdict: c.verdict };
    const { error: e2 } = await db.from("scores").update({ direction: c.direction, verdict: c.verdict, breakdown }).eq("catalyst_id", c.id);
    if (e2) throw e2;
  }
  console.log(`updated ${changes.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
