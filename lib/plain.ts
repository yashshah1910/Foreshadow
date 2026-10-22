/**
 * Plain-English wording for every number Foreshadow shows. One place, so
 * every page says the same thing the same way.
 */
import type { Direction, StoredScore, Verdict } from "@foreshadow/core";
import type { EventSummary } from "@/lib/data";
import { fmtDate, fmtPct } from "@/lib/format";

/** "$674K", "$2.9M", "$1.2B": the way a person would say it. */
export function money(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(a / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
  if (a >= 1e6) return `$${(a / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (a >= 1e3) return `$${Math.round(a / 1e3)}K`;
  return `$${Math.round(a)}`;
}

export function scoreWord(score: number): string {
  return score >= 70 ? "Very unusual" : score >= 40 ? "Unusual" : "About normal";
}

export function directionPlain(d: Direction): string {
  return d === "bullish" ? "Bets on a rise" : d === "bearish" ? "Bets on a fall" : "No clear side";
}

export function verdictPlain(v: Verdict): string {
  return v === "matched" ? "Bets were right" : v === "missed" ? "Bets were wrong" : v === "pending" ? "News still to come" : "No price data";
}

export function verdictShort(v: Verdict): string {
  return v === "matched" ? "Right" : v === "missed" ? "Wrong" : v === "pending" ? "Waiting" : "No data";
}

const KIND_NOUN: Record<string, string> = {
  fda: "FDA news",
  earnings: "earnings report",
  congress: "trade by a member of Congress",
  insider: "insider filing",
  economic: "economic release",
  potus: "White House event",
};

/** "Q3 earnings, after the close" → "Q3 earnings"; "Top-line results: X" kept. */
export function eventName(s: EventSummary): string {
  if (s.catalyst.kind === "earnings") {
    const when = s.catalyst.session === "premarket" ? ", before the open" : s.catalyst.session === "afterhours" ? ", after the close" : "";
    return `Earnings${when}`;
  }
  return s.catalyst.title.split(",")[0].trim();
}

export function kindNoun(kind: string): string {
  return KIND_NOUN[kind] ?? "news";
}

export interface CaseFacts {
  premium: number;
  callShare: number;
  timesNormal: number | null;
}

/**
 * The opening paragraph of a case, built only from the scored data so it is
 * always right and always there, even without Claude.
 */
export function caseSummary(s: EventSummary, facts: CaseFacts): string {
  const t = s.catalyst.ticker;
  const when = fmtDate(s.catalyst.eventDate, { year: false });
  const side =
    facts.callShare >= 0.6
      ? "mostly calls, which pay off if the stock rises"
      : facts.callShare <= 0.4
        ? "mostly puts, which pay off if the stock falls"
        : "split between calls (bets on a rise) and puts (bets on a fall)";
  const pace = facts.timesNormal && facts.timesNormal >= 1.5 ? `, about ${Math.round(facts.timesNormal)}× ${t}'s normal pace` : "";
  const open = s.partialWindow
    ? `${t} has ${kindNoun(s.catalyst.kind) === "earnings report" ? "an earnings report" : "news"} coming on ${when}. So far this week, traders have put ${money(facts.premium)} into large options bets${pace}, ${side}.`
    : `In the five trading days before ${t}'s ${eventName(s)} on ${when}, traders put ${money(facts.premium)} into large options bets${pace}, ${side}.`;
  const how = `Foreshadow rates that ${scoreWord(s.score).toLowerCase()}: ${s.score.toFixed(0)} out of 100.`;
  let end = "";
  if (s.verdict === "matched" || s.verdict === "missed") {
    const moved = s.realizedMovePct ?? 0;
    const dir = moved >= 0 ? "rose" : "fell";
    end = ` Options were pricing in a move of about ${fmtPct(s.impliedMovePct, { sign: false })}. The stock ${dir} ${fmtPct(Math.abs(moved), { sign: false })}, so the bets were ${s.verdict === "matched" ? "right" : "wrong"}.`;
  } else if (s.verdict === "pending") {
    end = " The news hasn't happened yet, so we can't say whether the bets were right.";
  }
  return `${open} ${how}${end}`;
}


export function factsFromStored(stored: StoredScore): CaseFacts {
  const sig = (k: string) => stored.breakdown.signals.find((s) => s.key === k);
  const dir = sig("directionalPremium");
  const flow = sig("flowIntensity");
  const call = dir?.detail.callPremium ?? 0;
  const put = dir?.detail.putPremium ?? 0;
  const premium = call + put;
  const timesNormal = flow && flow.baselineMean > 0 ? flow.footprintValue / flow.baselineMean : null;
  return { premium, callShare: premium > 0 ? call / premium : 0.5, timesNormal };
}
