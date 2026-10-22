/**
 * Catalyst tagger: turns rows that aren't ticker-shaped (President's
 * schedule, economic calendar) into catalysts for the tickers Claude says are
 * affected. Only runs when ANTHROPIC_API_KEY is set; otherwise the macro feed
 * stays off. Tagged rows are stored as catalysts with kind "potus"/"economic"
 * and scored like any other on the next ingest run.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UwClient } from "@foreshadow/uw";
import { isNarratorConfigured, tagCatalysts, type TaggerRow } from "@foreshadow/narrator";
import { onOrAfterTradingDay, type Catalyst, type IsoDate } from "@foreshadow/core";

export const TAG_MIN_CONFIDENCE = 0.6;

export async function tagMacroCatalysts(
  db: SupabaseClient,
  uw: UwClient,
  opts: { today: IsoDate; log?: (m: string) => void },
): Promise<Catalyst[]> {
  if (!isNarratorConfigured()) return [];
  const log = opts.log ?? (() => {});
  const rows: TaggerRow[] = [];
  const [potus, econ] = await Promise.all([
    uw.getPotusSchedule(opts.today).catch(() => []),
    uw.getEconomicCalendar().catch(() => []),
  ]);
  for (const p of potus) {
    const text = [p.type, p.details, p.location].filter(Boolean).join(" — ");
    if (text.trim()) rows.push({ id: `potus:${p.date}:${rows.length}`, source: "potus", text, date: p.date, time: p.time ?? undefined });
  }
  for (const e of econ) {
    const date = e.time.slice(0, 10);
    rows.push({ id: `economic:${date}:${rows.length}`, source: "economic", text: `${e.event} (${e.type}${e.reportedPeriod ? `, ${e.reportedPeriod}` : ""})`, date, time: e.time });
  }
  if (rows.length === 0) return [];
  const tagged = await tagCatalysts(rows);
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Keyed by catalyst id: two calendar rows with the same text and day (or a
  // ticker listed twice) map to one id, and Postgres rejects an upsert that
  // touches a row twice. The most confident tag wins.
  const byCatalyst = new Map<string, Catalyst>();
  for (const t of tagged) {
    const row = byId.get(t.id);
    if (!row) continue;
    for (const tk of t.tickers) {
      if (tk.confidence < TAG_MIN_CONFIDENCE) continue;
      const ticker = tk.ticker.toUpperCase();
      const eventDate = onOrAfterTradingDay(row.date);
      const slug = row.text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
      const id = `${row.source}:${ticker}:${eventDate}:${slug}`;
      const prev = byCatalyst.get(id);
      if (prev && Number(prev.payload?.confidence) >= tk.confidence) continue;
      byCatalyst.set(id, {
        id,
        ticker,
        kind: row.source === "potus" ? "potus" : "economic",
        eventDate,
        session: row.time ? (row.time.slice(11, 13) < "13" ? "premarket" : "intraday") : "unknown",
        title: row.text.slice(0, 120),
        source: "claude-tagger",
        payload: { confidence: tk.confidence, reason: tk.reason, sectors: t.sectors, relevance: t.relevance, raw: row.text },
      });
    }
  }
  const out = [...byCatalyst.values()];
  if (out.length) {
    const { error } = await db.from("catalysts").upsert(
      out.map((c) => ({ id: c.id, ticker: c.ticker, kind: c.kind, event_date: c.eventDate, session: c.session, title: c.title, source: c.source, payload: c.payload })),
      { onConflict: "id" },
    );
    if (error) log(`tagger upsert failed: ${error.message}`);
  }
  log(`tagger: ${rows.length} rows → ${out.length} ticker catalysts`);
  return out;
}

/** Previously tagged macro catalysts in a date range (so they get scored). */
export async function loadTaggedCatalysts(db: SupabaseClient, from: IsoDate, to: IsoDate): Promise<Catalyst[]> {
  const { data } = await db
    .from("catalysts")
    .select("id, ticker, kind, event_date, session, title, source, payload")
    .in("kind", ["potus", "economic"])
    .gte("event_date", from)
    .lte("event_date", to)
    .limit(200);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    ticker: String(r.ticker),
    kind: r.kind as Catalyst["kind"],
    eventDate: String(r.event_date),
    session: r.session as Catalyst["session"],
    title: String(r.title),
    source: String(r.source),
    payload: (r.payload as Record<string, unknown>) ?? {},
  }));
}
