/**
 * Deterministic template text used when Claude is unavailable (no key, API
 * error, or unverifiable numbers). Every figure comes straight from the input,
 * formatted so `verifyNumbers` accepts it.
 */
import type { DossierEvent, DossierInput, Narration, NarrationAlert, NarrationInput, NarrationSignal } from "./types";

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

function utcTime(iso: string): string | null {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}:${m[2]} UTC` : null;
}

/** "a 9.2%" but "an 11.2%" / "an 8.4%" / "an 18.6%". */
function article(pct: number): string {
  const lead = Math.floor(Math.abs(pct));
  return String(lead).startsWith("8") || lead === 11 || lead === 18 ? "an" : "a";
}

/** "Q3 earnings, after the close" -> "Q3 earnings" */
function titleCore(title: string): string {
  return title.split(",")[0].trim();
}

const BAND_PHRASES: Record<NarrationInput["band"], string> = {
  quiet: "a quiet footprint",
  notable: "a notable footprint",
  "someone-knew": "in someone-knew territory",
};

function flagPhrases(flags: NarrationInput["flags"]): string[] {
  const out: string[] = [];
  if (flags.partialWindow) out.push("the footprint window is still filling");
  if (flags.insufficientHistory) out.push("there is not enough history for a reliable baseline");
  if (flags.multiCatalyst) out.push("other catalysts share this window");
  if (flags.isIndexOrEtf) out.push("as an index or ETF its positioning is less specific");
  return out;
}

function largestAlert(alerts: NarrationAlert[]): NarrationAlert | undefined {
  return alerts.reduce<NarrationAlert | undefined>(
    (best, a) => (best === undefined || a.premium > best.premium ? a : best),
    undefined,
  );
}

function strongestSignals(signals: NarrationSignal[], n: number): NarrationSignal[] {
  return [...signals].sort((a, b) => b.contribution - a.contribution).slice(0, n);
}

function moveVerb(pct: number): string {
  if (pct > 0) return "rose";
  if (pct < 0) return "fell";
  return "was flat at";
}

function openingSentence(input: NarrationInput): string {
  const flags = flagPhrases(input.flags);
  const tail = flags.length > 0 ? `, though ${flags.join(" and ")}` : "";
  return `In the five sessions before ${input.ticker}'s ${titleCore(input.eventTitle)} on ${shortDate(input.eventDate)}, options positioning ran ${input.direction} and scored ${Math.round(input.score)}, ${BAND_PHRASES[input.band]}${tail}.`;
}

function signalSentence(input: NarrationInput): string {
  const [a, b] = strongestSignals(input.signals, 2);
  let text: string;
  if (a && b) text = `${a.label} and ${b.label.toLowerCase()} carried the most weight`;
  else if (a) text = `${a.label} carried the most weight`;
  else text = "No individual signal stood out";
  const top = largestAlert(input.topAlerts);
  if (top) {
    const when = utcTime(top.executedAt);
    text += `, and the largest alert was ${formatMoney(top.premium)} of ${top.side}-side ${top.type}s at the $${top.strike} strike expiring ${shortDate(top.expiry)}, placed ${when ? `at ${when} ` : ""}on ${shortDate(top.executedAt)}`;
  } else {
    text += ", and no single alert dominated the window";
  }
  return `${text}.`;
}

function verdictSentence(input: NarrationInput): string {
  const v = input.verdict;
  if (!v || v.verdict === "pending") return "The event has not happened yet, so the verdict is pending.";
  if (v.verdict === "insufficient") return "There was not enough price data to judge whether the footprint matched the move.";
  const implied = v.impliedMovePct === null ? "No implied move was available" : `Options priced ${article(v.impliedMovePct)} ${formatPct(v.impliedMovePct)} move`;
  const window = v.reactionWindow === "T" ? "on the day" : "over the next session (T+1)";
  const realized =
    v.realizedMovePct === null ? "the realized move was not available" : `the stock ${moveVerb(v.realizedMovePct)} ${formatPct(v.realizedMovePct)} ${window}`;
  return `${implied}; ${realized}, so the footprint ${v.verdict === "matched" ? "matched" : "missed"} the move.`;
}

function buildCaption(input: NarrationInput): string {
  const top = largestAlert(input.topAlerts);
  const parts = [
    top
      ? `${formatMoney(top.premium)} of ${top.side}-side ${top.type}s hit ${input.ticker} before its ${titleCore(input.eventTitle)}.`
      : `${input.ticker} before its ${titleCore(input.eventTitle)}.`,
    `Score ${Math.round(input.score)}, ${input.direction}.`,
  ];
  const v = input.verdict;
  if (v && (v.verdict === "matched" || v.verdict === "missed") && v.realizedMovePct !== null) {
    parts.push(`The stock ${moveVerb(v.realizedMovePct)} ${formatPct(v.realizedMovePct)}: footprint ${v.verdict}.`);
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
  const story = [openingSentence(input), signalSentence(input), verdictSentence(input)].join(" ");
  return {
    story,
    caption: buildCaption(input),
    model: "fallback",
    numbersVerified: true,
    unverifiedNumbers: [],
  };
}

function outcome(e: DossierEvent): string {
  if (e.verdict === "pending") return "is still pending";
  if (e.realizedMovePct === null) return e.verdict === "matched" ? "matched the move" : "had no measurable move";
  const move = `the stock ${moveVerb(e.realizedMovePct)} ${formatPct(e.realizedMovePct)}`;
  return e.verdict === "matched" ? `matched as ${move}` : `missed: ${move}`;
}

/** One deterministic paragraph on whether the ticker is a repeat offender. */
export function fallbackDossierSummary(input: DossierInput): string {
  const { ticker, events, hitRate } = input;
  if (events.length === 0 && hitRate.scored === 0) {
    return `${ticker} has no scored catalysts in Foreshadow yet, so there is nothing to judge.`;
  }
  const plural = hitRate.scored === 1 ? "" : "s";
  let classification: string;
  if (hitRate.strong >= 2 && hitRate.matched * 2 >= hitRate.strong) {
    classification = "which makes it a repeat offender";
  } else if (hitRate.strong >= 1) {
    classification = "a pattern worth watching but not yet a repeat offender";
  } else {
    classification = "so there is no sign of a repeat pattern";
  }
  const sentences = [
    `${ticker} has ${hitRate.scored} scored catalyst${plural} in Foreshadow; ${hitRate.strong} reached someone-knew territory and ${hitRate.matched} of those matched the move, ${classification}.`,
  ];
  const top = [...events].sort((a, b) => b.score - a.score)[0];
  if (top) {
    sentences.push(
      `The strongest footprint, ${Math.round(top.score)} and ${top.direction}, came before the ${titleCore(top.title)} on ${shortDate(top.eventDate, true)} and ${outcome(top)}.`,
    );
  }
  const latest = [...events].sort((a, b) => (a.eventDate < b.eventDate ? 1 : -1))[0];
  if (latest && latest !== top) {
    sentences.push(
      `Most recently, the ${titleCore(latest.title)} on ${shortDate(latest.eventDate, true)} scored ${Math.round(latest.score)} (${latest.direction}) and ${outcome(latest)}.`,
    );
  }
  return sentences.join(" ");
}
