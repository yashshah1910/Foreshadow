import { getRadar, getTickerDossier, getToday } from "@/lib/data";
import type { EventSummary, QueuedCatalyst } from "@/lib/data";
import { env } from "@/lib/env";
import { directionPlain, eventName, scoreWord } from "@/lib/plain";
import { fmtPct } from "@/lib/format";

/**
 * iCalendar feed of upcoming news. Without ?tickers= it holds the news whose betting is already unusual (40+);
 * with ?tickers=AAPL,TSLA it holds everything coming up for those stocks. Calendar apps re-fetch it on their own.
 */
export const dynamic = "force-dynamic";

const MIN_SCORE = 40;

export async function GET(request: Request) {
  const base = (env.siteUrl.startsWith("http") ? env.siteUrl : `https://${env.siteUrl}`).replace(/\/$/, "");
  const requested = (new URL(request.url).searchParams.get("tickers") ?? "")
    .toUpperCase()
    .split(",")
    .map((t) => t.trim().replace(/[^A-Z0-9.]/g, "").slice(0, 10))
    .filter(Boolean);
  const tickers = [...new Set(requested)].slice(0, 25);
  const today = await getToday();
  const dossiers = tickers.length ? await Promise.all(tickers.map((t) => getTickerDossier(t).catch(() => null))) : [];
  const events: EventSummary[] = tickers.length
    ? dossiers.flatMap((d) => (d?.events ?? []).filter((e) => e.catalyst.eventDate >= today))
    : (await getRadar(10, MIN_SCORE)).filter((r) => r.windowOpen && r.score >= MIN_SCORE);
  // News on file for a chosen stock that isn't scored yet still belongs on its calendar.
  const queued = dossiers.flatMap((d) =>
    [...(d?.queued ?? []), ...(d?.next ?? [])]
      .filter((q) => q.eventDate >= today)
      .map((q) => queuedEvent(d!.ticker, q, base)),
  );

  const name = tickers.length ? `Foreshadow: ${tickers.join(", ")}` : "Foreshadow: unusual betting before the news";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Foreshadow//Coming up//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${text(name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    ...events.flatMap((e) => vevent(e, base)),
    ...queued.flat(),
    "END:VCALENDAR",
  ];
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `inline; filename="foreshadow${tickers.length ? `-${tickers.join("-").toLowerCase()}` : ""}.ics"`,
      "cache-control": "public, max-age=900",
    },
  });
}

function vevent(e: EventSummary, base: string): string[] {
  const url = `${base}/event/${encodeURIComponent(e.catalyst.id)}`;
  const day = e.catalyst.eventDate.replaceAll("-", "");
  const scored = e.partialWindow ? e.flags.footprintDaysUsed > 0 : true;
  const betting = scored
    ? `Options betting so far: ${Math.round(e.score)} out of 100 (${scoreWord(e.score).toLowerCase()}), ${directionPlain(e.direction).toLowerCase()}.`
    : "Foreshadow starts scoring the betting five trading days before the news.";
  const expected = e.impliedMovePct !== null ? ` Options are pricing in a move of about ±${fmtPct(e.impliedMovePct, { sign: false })}.` : "";
  return [
    "BEGIN:VEVENT",
    `UID:${text(e.catalyst.id)}@foreshadow`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${nextDay(e.catalyst.eventDate)}`,
    `SUMMARY:${text(`${e.catalyst.ticker}: ${eventName(e)}${scored ? ` · betting ${Math.round(e.score)}/100` : ""}`)}`,
    `DESCRIPTION:${text(`${betting}${expected} ${url}`)}`,
    `URL:${url}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
}

function queuedEvent(ticker: string, q: QueuedCatalyst, base: string): string[] {
  const { eventDate: date, title } = q;
  return [
    "BEGIN:VEVENT",
    // The catalyst id when known, so the event keeps its UID once it is scored.
    `UID:${text(q.id ?? `${q.kind}:${ticker}:${date}`)}@foreshadow`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`,
    `DTSTART;VALUE=DATE:${date.replaceAll("-", "")}`,
    `DTEND;VALUE=DATE:${nextDay(date)}`,
    `SUMMARY:${text(`${ticker}: ${title}`)}`,
    `DESCRIPTION:${text(`Foreshadow starts scoring the betting five trading days before the news. ${base}/ticker/${ticker}`)}`,
    `URL:${base}/ticker/${ticker}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

/** RFC 5545 text escaping. */
function text(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets, continuing with a leading space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (out.length === 0 ? 75 : 74)) {
      out.push(cur);
      cur = "";
      len = 0;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}
