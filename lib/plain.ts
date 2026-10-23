/**
 * Plain-English wording for every number Foreshadow shows. One place, so
 * every page says the same thing the same way.
 */
import { windowBets, type Direction, type StoredScore, type Verdict } from "@foreshadow/core";
import type { EventSummary, ScorecardBand } from "@/lib/data";
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

/**
 * The result of a case in three honest states instead of right/wrong:
 * "right" (bigger move than expected, in the bets' direction), "rightWay"
 * (the bets' direction, but a smaller move than expected), "wrongWay"
 * (against the bets). The stored verdict is unchanged; this only reads it
 * together with the lean and the actual move.
 */
export type Outcome = "right" | "rightWay" | "wrongWay" | "noLean" | "pending" | "none";

export function outcomeOf(s: { verdict: Verdict; direction: Direction; realizedMovePct: number | null }): Outcome {
  if (s.verdict === "pending") return "pending";
  if (s.verdict === "insufficient" || s.realizedMovePct === null) return "none";
  if (s.verdict === "matched") return "right";
  if (s.direction === "mixed") return "noLean";
  return (s.direction === "bullish") === (s.realizedMovePct > 0) ? "rightWay" : "wrongWay";
}

export const OUTCOME_SHORT: Record<Outcome, string> = {
  right: "Right",
  rightWay: "Right way, small move",
  wrongWay: "Wrong way",
  noLean: "No clear side",
  pending: "Waiting",
  none: "No data",
};

export const OUTCOME_PLAIN: Record<Outcome, string> = {
  right: "the stock beat the expected move, the way the bets leaned",
  rightWay: "the stock moved the way the bets leaned, but less than expected",
  wrongWay: "the stock moved against the bets",
  noLean: "the bets didn't lean either way",
  pending: "the news is still to come",
  none: "no price data",
};

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

/** The event as it reads inside a sentence: "before TSLA's earnings report". */
export function eventPhrase(s: EventSummary): string {
  return s.catalyst.kind === "earnings" ? "earnings report" : eventName(s);
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
    facts.premium <= 0
      ? s.direction === "bullish" || s.direction === "bearish"
        ? `so the lean toward a ${s.direction === "bullish" ? "rise" : "fall"} comes only from new open contracts and option prices`
        : "and nothing else leaned either way"
      : facts.callShare >= 0.6
      ? "mostly calls, which pay off if the stock rises"
      : facts.callShare <= 0.4
        ? "mostly puts, which pay off if the stock falls"
        : s.direction === "bullish" || s.direction === "bearish"
          ? `split between calls (bets on a rise) and puts (bets on a fall), though the other signals lean toward a ${s.direction === "bullish" ? "rise" : "fall"}`
          : "split between calls (bets on a rise) and puts (bets on a fall)";
  const into = facts.premium > 0 ? `put ${money(facts.premium)} into large options bets` : "made no large options trades"
  const pace = facts.timesNormal && facts.timesNormal >= 1.5 ? `, about ${Math.round(facts.timesNormal)}× ${t}'s normal pace` : "";
  const open = s.partialWindow
    ? `${t} has ${kindNoun(s.catalyst.kind) === "earnings report" ? "an earnings report" : "news"} coming on ${when}. So far this week, traders have ${into}${pace}, ${side}.`
    : s.catalyst.kind === "earnings"
      ? `In the five trading days before ${t}'s ${eventPhrase(s)} on ${when}, traders ${into}${pace}, ${side}.`
      : `In the five trading days before ${t}'s news on ${when} (${eventName(s)}), traders ${into}${pace}, ${side}.`;
  const how = `Foreshadow rates that ${scoreWord(s.score).toLowerCase()}: ${s.score.toFixed(0)} out of 100.`;
  let end = "";
  if (s.verdict === "matched" || s.verdict === "missed") {
    const moved = s.realizedMovePct ?? 0;
    const dir = moved >= 0 ? "rose" : "fell";
    const o = outcomeOf(s);
    const result =
      o === "right"
        ? "so the bets were right"
        : o === "rightWay"
          ? "the way the bets leaned, but less than expected, so it doesn't count as right"
          : o === "wrongWay"
            ? "against the bets, so they were wrong"
            : "and the bets didn't lean either way";
    end = ` Options were pricing in a move of about ${fmtPct(s.impliedMovePct, { sign: false })}. The stock ${dir} ${fmtPct(Math.abs(moved), { sign: false })}, ${result}.`;
  } else if (s.verdict === "pending") {
    end = " The news hasn't happened yet, so we can't say whether the bets were right.";
  }
  return `${open} ${how}${end}`;
}


export function factsFromStored(stored: StoredScore): CaseFacts {
  const sig = (k: string) => stored.breakdown.signals.find((s) => s.key === k);
  const dir = sig("directionalPremium");
  const flow = sig("flowIntensity");
  // Bets are calls and puts bought at the asking price; trades sold at the bid don't count.
  const { rise: call, fall: put } = windowBets(dir?.detail);
  const premium = call + put;
  const timesNormal = flow && flow.baselineMean > 0 ? flow.footprintValue / flow.baselineMean : null;
  return { premium, callShare: premium > 0 ? call / premium : 0.5, timesNormal };
}

/** Below this many cases a scorecard row is shown faded and findings say "early". */
export const SCORECARD_MIN_CASES = 10;
const MIN_CASES = SCORECARD_MIN_CASES;

function pct(n: number, d: number): number {
  return d > 0 ? (n / d) * 100 : 0;
}

/** One-sided two-sample z for "rate 1 is higher than rate 2" (pooled). */
export function liftZ(x1: number, n1: number, x2: number, n2: number): number {
  if (n1 === 0 || n2 === 0) return 0;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (x1 / n1 - x2 / n2) / se : 0;
}

/** "about 3.5 times" */
function timesPhrase(times: number): string {
  if (times > 20) return "far more often than";
  if (times < 1.95) return "more often than";
  const half = Math.round(times * 2) / 2;
  return `about ${Number.isInteger(half) ? half.toFixed(0) : half.toFixed(1)} times as often as`;
}

/**
 * One honest sentence per kind: unusual (40+) against ordinary (under 20). Only cases where the bets leaned
 * can be right, so the rates count those; a lift is claimed only past a one-sided two-sample test.
 */
export function scorecardFinding(kind: string, bands: ScorecardBand[], nounOverride?: string): string {
  const noun = nounOverride ?? (kind === "fda" ? "FDA news" : kind === "earnings" ? "earnings" : "this kind of news");
  const unusual = bands.filter((b) => b.min >= 40);
  const u = { leaned: unusual.reduce((n, b) => n + b.leaned, 0), right: unusual.reduce((n, b) => n + b.right, 0) };
  const ordinary = bands.find((b) => b.min === 0);
  if (!ordinary || ordinary.leaned < MIN_CASES) return `Not enough finished cases before ${noun} to compare yet.`;
  if (u.leaned < 5) return `Unusual betting before ${noun} has been rare so far: ${u.leaned} case${u.leaned === 1 ? "" : "s"}. Too few to judge.`;
  const up = pct(u.right, u.leaned);
  const op = pct(ordinary.right, ordinary.leaned);
  const early = u.leaned < MIN_CASES * 2 ? ` That's only ${u.leaned} cases, so treat it as early.` : "";
  const z = liftZ(u.right, u.leaned, ordinary.right, ordinary.leaned);
  if (z >= 1.65 && u.right >= 3) {
    const ratio = timesPhrase(op >= 1 ? up / op : Infinity);
    return `Before ${noun}, when the betting leaned one way, unusual betting was right ${up.toFixed(0)}% of the time (${u.right} of ${u.leaned}), ${ratio} ordinary betting (${op.toFixed(0)}%).${edgeClause(unusual, ordinary)}${early}`;
  }
  return `Before ${noun}, unusual betting hasn't clearly beaten ordinary betting so far: ${up.toFixed(0)}% right against ${op.toFixed(0)}%, counting cases where the bets leaned.${early}`;
}

/**
 * Where a lift comes from. "Right" needs both a big move and the right direction; when unusual betting
 * only beats ordinary betting on size, say so rather than imply it knew which way.
 */
function edgeClause(unusual: ScorecardBand[], ordinary: ScorecardBand): string {
  const sum = (k: "cases" | "movedMore" | "leaned" | "leanedRight") => unusual.reduce((n, b) => n + b[k], 0);
  const bigU = pct(sum("movedMore"), sum("cases"));
  const bigO = pct(ordinary.movedMore, ordinary.cases);
  const wayU = pct(sum("leanedRight"), sum("leaned"));
  const wayO = pct(ordinary.leanedRight, ordinary.leaned);
  if (sum("leaned") < 5 || wayU > wayO + 5) return "";
  return ` The edge is in the size of the move: the stock moved more than options expected ${bigU.toFixed(0)}% of the time, against ${bigO.toFixed(0)}%. Which way it moved was close to a coin flip (${wayU.toFixed(0)}% the way the bets leaned).`;
}

export interface HeadlineFinding {
  kind: string;
  /** "FDA news" */
  noun: string;
  /** Share of unusual (40+) cases where the stock moved more than options expected, and of ordinary (under 20) ones. */
  unusualPct: number;
  ordinaryPct: number;
  unusualCases: number;
  ordinaryCases: number;
}

/**
 * The strongest claim the record supports, for the landing: the kind of news where, after unusual betting,
 * the stock moved more than options expected clearly more often than after ordinary betting (the same
 * one-sided z-test the scorecard uses). Null when no kind clears it.
 */
export function headlineFinding(kinds: { kind: string; bands: ScorecardBand[] }[]): HeadlineFinding | null {
  let best: HeadlineFinding | null = null;
  let bestZ = -Infinity;
  for (const k of kinds) {
    const unusual = k.bands.filter((b) => b.min >= 40);
    const ordinary = k.bands.find((b) => b.min === 0);
    const n = unusual.reduce((a, b) => a + b.cases, 0);
    const hits = unusual.reduce((a, b) => a + b.movedMore, 0);
    if (!ordinary || ordinary.cases < MIN_CASES || n < MIN_CASES || hits < 3) continue;
    const z = liftZ(hits, n, ordinary.movedMore, ordinary.cases);
    if (z < 1.65 || z <= bestZ) continue;
    bestZ = z;
    best = {
      kind: k.kind,
      noun: k.kind === "fda" ? "FDA news" : k.kind === "earnings" ? "earnings" : "this kind of news",
      unusualPct: Math.round(pct(hits, n)),
      ordinaryPct: Math.round(pct(ordinary.movedMore, ordinary.cases)),
      unusualCases: n,
      ordinaryCases: ordinary.cases,
    };
  }
  return best;
}

/** Kinds of news ordered so a finding that shows a lift comes first, then by case count. */
export function kindsLiftFirst<K extends { kind: string; cases: number; bands: ScorecardBand[] }>(kinds: K[]): K[] {
  const lift = (k: K) => Number(/as often as|more often than/.test(scorecardFinding(k.kind, k.bands)));
  return [...kinds].sort((a, b) => lift(b) - lift(a) || b.cases - a.cases);
}
