/**
 * Deterministic template text used when Claude is unavailable (no key, API
 * error, or unverifiable numbers). Every figure comes straight from the input,
 * formatted so `verifyNumbers` accepts it.
 */
import type { DossierEvent, DossierInput, Narration, NarrationAlert, NarrationInput } from "./types";

export const CAPTION_MAX_LENGTH = 200;

export function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}K`;
  return `${sign}$${Math.round(abs)}`;
}

export function formatPct(n: number): string {
  return `${Math.abs(n).toFixed(1)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-10-09" -> "Oct 9"; with year -> "Oct 9, 2025". */
function shortDate(iso: string, withYear = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const base = `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
  return withYear ? `${base}, ${m[1]}` : base;
}

/** "Q3 earnings, after the close" -> "Q3 earnings" */
function titleCore(title: string): string {
  return title.split(",")[0].trim();
}

const BAND_PHRASES: Record<NarrationInput["band"], string> = {
  quiet: "about normal for this stock",
  notable: "unusual for this stock",
  "someone-knew": "very unusual for this stock",
};

const LEAN_PHRASES: Record<string, string> = {
  bullish: "leaned toward bets on a rise",
  bearish: "leaned toward bets on a fall",
  mixed: "didn't lean clearly either way",
};

function flagPhrases(flags: NarrationInput["flags"]): string[] {
  const out: string[] = [];
  if (flags.partialWindow) out.push("the week isn't over yet");
  if (flags.insufficientHistory) out.push("this stock has little trading history to compare against");
  if (flags.multiCatalyst) out.push("other news fell in the same week");
  if (flags.isIndexOrEtf) out.push("this is a fund, not a single company");
  return out;
}

function largestAlert(alerts: NarrationAlert[]): NarrationAlert | undefined {
  return alerts.reduce<NarrationAlert | undefined>(
    (best, a) => (best === undefined || a.premium > best.premium ? a : best),
    undefined,
  );
}

function moveVerb(pct: number): string {
  if (pct > 0) return "rose";
  if (pct < 0) return "fell";
  return "was flat at";
}

/** "earnings report" for earnings, the news title otherwise. */
function eventPhrase(input: NarrationInput): string {
  return input.kind === "earnings" ? "earnings report" : titleCore(input.eventTitle);
}

function betPhrase(a: NarrationAlert): string {
  return a.type === "call" ? "calls, a bet on the stock rising" : "puts, a bet on the stock falling";
}

function openingSentence(input: NarrationInput): string {
  const flags = flagPhrases(input.flags);
  const tail = flags.length > 0 ? `, though ${flags.join(" and ")}` : "";
  return `In the five trading days before ${input.ticker}'s ${eventPhrase(input)} on ${shortDate(input.eventDate)}, the options betting scored ${Math.round(input.score)}, ${BAND_PHRASES[input.band]}, and ${LEAN_PHRASES[input.direction] ?? LEAN_PHRASES.mixed}${tail}.`;
}

function tradeSentence(input: NarrationInput): string {
  const top = largestAlert(input.topAlerts);
  if (!top) return "No single large trade stood out that week.";
  return `The biggest single trade was ${formatMoney(top.premium)} of ${betPhrase(top)} past $${top.strike}, placed on ${shortDate(top.tradeDate)}.`;
}

function verdictSentence(input: NarrationInput): string {
  const v = input.verdict;
  if (!v || v.verdict === "pending") return "The news hasn't come out yet, so it's too early to say whether the bets were right.";
  if (v.verdict === "insufficient") return "There wasn't enough price data to tell whether the bets were right.";
  const expected =
    v.impliedMovePct === null ? "No expected move was available" : `Options were pricing in a move of about ${formatPct(v.impliedMovePct)}`;
  const when = v.reactionWindow === "T" ? "that day" : "the next day";
  const actual =
    v.realizedMovePct === null ? "the actual move wasn't available" : `the stock ${moveVerb(v.realizedMovePct)} ${formatPct(v.realizedMovePct)} ${when}`;
  if (v.verdict === "matched" || v.realizedMovePct === null) return `${expected}; ${actual}, so the bets were ${v.verdict === "matched" ? "right" : "wrong"}.`;
  if (input.direction === "mixed") return `${expected}; ${actual}, and the bets didn't lean either way.`;
  const theirWay = (input.direction === "bullish") === (v.realizedMovePct > 0);
  return theirWay
    ? `${expected}; ${actual}, the way the bets leaned but less than expected, so it doesn't count as right.`
    : `${expected}; ${actual}, against the bets, so they were wrong.`;
}

function buildCaption(input: NarrationInput): string {
  const top = largestAlert(input.topAlerts);
  const parts = [
    top
      ? `Before ${input.ticker}'s ${eventPhrase(input)}, someone put ${formatMoney(top.premium)} on the stock ${top.type === "call" ? "rising" : "falling"}.`
      : `Options betting before ${input.ticker}'s ${eventPhrase(input)} scored ${Math.round(input.score)}.`,
  ];
  const v = input.verdict;
  if (v && (v.verdict === "matched" || v.verdict === "missed") && v.realizedMovePct !== null) {
    const theirWay = input.direction !== "mixed" && (input.direction === "bullish") === (v.realizedMovePct > 0);
    const result = v.verdict === "matched" ? "so the bets were right" : theirWay ? "their way, but less than expected" : "against the bets";
    parts.push(`The stock ${moveVerb(v.realizedMovePct)} ${formatPct(v.realizedMovePct)}, ${result}.`);
  }
  let caption = "";
  for (const part of parts) {
    const next = caption ? `${caption} ${part}` : part;
    if (next.length > CAPTION_MAX_LENGTH) break;
    caption = next;
  }
  return caption || parts[0].slice(0, CAPTION_MAX_LENGTH);
}

/** Three deterministic sentences plus a caption; never calls Claude, never throws on empty inputs. */
export function fallbackNarration(input: NarrationInput): Narration {
  const story = [openingSentence(input), tradeSentence(input), verdictSentence(input)].join(" ");
  return {
    story,
    caption: buildCaption(input),
    model: "fallback",
    numbersVerified: true,
    unverifiedNumbers: [],
  };
}

const LEAN: Record<string, string> = { bullish: "bets on a rise", bearish: "bets on a fall", mixed: "bets split both ways" };

function plainOutcome(e: DossierEvent): string {
  if (e.verdict === "pending") return "the result isn't in yet";
  if (e.realizedMovePct === null) return e.verdict === "matched" ? "the bets were right" : "the stock barely moved";
  const move = `the stock ${moveVerb(e.realizedMovePct)} ${formatPct(e.realizedMovePct)}`;
  return e.verdict === "matched" ? `the bets were right: ${move}` : `the bets were wrong: ${move}`;
}

/** One deterministic paragraph, in plain words, on whether a pattern shows up. */
export function fallbackDossierSummary(input: DossierInput): string {
  const { ticker, events, hitRate } = input;
  if (events.length === 0 && hitRate.scored === 0) {
    return `${ticker} has no scored news on Foreshadow yet, so there is nothing to judge.`;
  }
  const times = (n: number) => (n === 1 ? "once" : `${n} times`);
  const pieces = hitRate.scored === 1 ? "piece" : "pieces";
  let pattern: string;
  if (hitRate.strong >= 2 && hitRate.matched * 2 >= hitRate.strong) {
    pattern = "That is a pattern: very unusual betting keeps showing up before its news, and keeps being right.";
  } else if (hitRate.strong >= 1) {
    pattern = "Worth watching, but too few cases to call it a pattern.";
  } else {
    pattern = "So far there is no sign of a pattern.";
  }
  const sentences = [
    `Foreshadow has scored the betting before ${hitRate.scored} ${pieces} of ${ticker} news. It was very unusual ${times(hitRate.strong)}, and ${hitRate.matched} of those bets were right. ${pattern}`,
  ];
  const top = [...events].sort((a, b) => b.score - a.score)[0];
  if (top) {
    sentences.push(
      `The most unusual betting, a score of ${Math.round(top.score)} with ${LEAN[top.direction] ?? "mixed bets"}, came before the ${titleCore(top.title)} on ${shortDate(top.eventDate, true)}, and ${plainOutcome(top)}.`,
    );
  }
  const latest = [...events].sort((a, b) => (a.eventDate < b.eventDate ? 1 : -1))[0];
  if (latest && latest !== top) {
    sentences.push(
      `Most recently, the ${titleCore(latest.title)} on ${shortDate(latest.eventDate, true)} scored ${Math.round(latest.score)}, and ${plainOutcome(latest)}.`,
    );
  }
  return sentences.join(" ");
}
