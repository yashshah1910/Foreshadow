import { getLeaderboard, getRadar, getTickerDossier } from "@/lib/data";
import type { EventSummary } from "@/lib/data";
import { env } from "@/lib/env";
import { directionPlain, eventName, OUTCOME_PLAIN, outcomeOf, scoreWord } from "@/lib/plain";
import { fmtDate, fmtPct } from "@/lib/format";

/** RSS 2.0 feed of unusual betting: upcoming news once it turns unusual, and recent finished cases. */
export const dynamic = "force-dynamic";

const MIN_SCORE = 40;

export async function GET(request: Request) {
  const base = (env.siteUrl.startsWith("http") ? env.siteUrl : `https://${env.siteUrl}`).replace(/\/$/, "");
  const ticker = new URL(request.url).searchParams.get("ticker")?.trim().toUpperCase().replace(/[^A-Z0-9.]/g, "").slice(0, 10) || null;
  // ?ticker=TSLA: every scored case for one stock, unusual or not.
  const source = ticker
    ? ((await getTickerDossier(ticker))?.events ?? []).filter((e) => !e.partialWindow || e.flags.footprintDaysUsed > 0)
    : await Promise.all([getLeaderboard({ minScore: MIN_SCORE, days: 30, limit: 40 }), getRadar(10, MIN_SCORE)]).then(([past, radar]) => [
        ...radar.filter((r) => r.windowOpen && r.score >= MIN_SCORE),
        ...past,
      ]);
  const title = ticker ? `Foreshadow: ${ticker}` : "Foreshadow: unusual options betting before company news";
  const blurb = ticker
    ? `Every scored case for ${ticker}: how unusual the options betting was before its news, and whether the bets were right.`
    : `Cases where the options betting before an FDA decision or an earnings report was unusual (score ${MIN_SCORE} or more), with what the stock did.`;
  const self = ticker ? `${base}/feed.xml?ticker=${ticker}` : `${base}/feed.xml`;
  const items = source
    .sort((a, b) => b.catalyst.eventDate.localeCompare(a.catalyst.eventDate) || b.score - a.score)
    .slice(0, 50)
    .map((s) => item(s, base));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(title)}</title>
<link>${ticker ? `${base}/ticker/${ticker}` : base}</link>
<atom:link href="${esc(self)}" rel="self" type="application/rss+xml"/>
<description>${esc(blurb)}</description>
<language>en-us</language>
${items.join("\n")}
</channel>
</rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=900" } });
}

function item(s: EventSummary, base: string): string {
  const url = `${base}/event/${encodeURIComponent(s.catalyst.id)}`;
  const when = fmtDate(s.catalyst.eventDate, { year: true });
  const lean = directionPlain(s.direction).toLowerCase();
  const result =
    s.verdict === "matched" || s.verdict === "missed"
      ? `The stock moved ${fmtPct(s.realizedMovePct)} against an expected ±${fmtPct(s.impliedMovePct, { sign: false })}: ${OUTCOME_PLAIN[outcomeOf(s)]}.`
      : `The news is still ahead. Options are pricing in a move of about ±${fmtPct(s.impliedMovePct, { sign: false })}.`;
  const title = `${s.catalyst.ticker}: ${eventName(s)}, ${when}. Betting scored ${s.score.toFixed(0)} (${scoreWord(s.score).toLowerCase()})`;
  const body = `In the days before ${s.catalyst.ticker}'s news on ${when}, options betting scored ${s.score.toFixed(0)} out of 100, mostly ${lean}. ${result}`;
  return `<item>
<title>${esc(title)}</title>
<link>${url}</link>
<guid isPermaLink="false">${esc(`${s.catalyst.id}:${s.verdict}`)}</guid>
<pubDate>${(s.verdict === "pending" ? new Date() : new Date(`${s.catalyst.eventDate}T13:30:00Z`)).toUTCString()}</pubDate>
<description>${esc(body)}</description>
</item>`;
}

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
