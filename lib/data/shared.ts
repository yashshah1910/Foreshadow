import {
  footprintWindow,
  partialFootprintWindow,
  sessionStarted,
  scoreBand,
  type Catalyst,
  type IsoDate,
  type StoredScore,
} from "@foreshadow/core";
import type { Company, EventSummary, HitRate, LeaderboardFilters, PastCounts, RadarItem, Scorecard, ScorecardBand, ScorecardCase, StripDay } from "./types";

/** Flow premium for T-10 .. T-1, taken from the stored daily metrics. */
export function buildStrip(stored: StoredScore): StripDay[] {
  const days = footprintWindow(stored.eventDate, 10);
  const window = new Set(footprintWindow(stored.eventDate));
  const byDate = new Map((stored.breakdown?.daily ?? []).map((m) => [m.date, m]));
  return days.map((date) => {
    const m = byDate.get(date);
    const inWindow = window.has(date);
    return {
      date,
      call: m?.callPremium ?? 0,
      put: m?.putPremium ?? 0,
      inWindow,
      future: !m && stored.partialWindow && inWindow,
    };
  });
}

export function toSummary(stored: StoredScore, catalyst: Catalyst, company: Company | null): EventSummary {
  return {
    catalyst,
    strip: buildStrip(stored),
    company,
    score: stored.score,
    direction: stored.direction,
    verdict: stored.verdict,
    realizedMovePct: stored.realizedMovePct,
    impliedMovePct: stored.impliedMovePct,
    partialWindow: stored.partialWindow,
    band: scoreBand(stored.score),
    flags: stored.flags,
    computedAt: stored.computedAt,
  };
}

const KEEP_UPPER = new Set(["LP", "LLC", "PLC", "SA", "SAB", "CV", "NV", "AG", "SE", "ASA", "AB", "NT", "ADR", "REIT", "ETF", "USA", "US", "UK", "II", "III", "IV", "UDR", "NBT", "TFI", "TIM", "HCA", "AT&T", "IBM", "CME", "CSX", "UPS", "AMD", "AES"]);
const LOWER = new Set(["of", "and", "the", "de", "du", "la", "for"]);

/**
 * UW sends most company names in capitals ("PROCTER & GAMBLE"). Title-case
 * those, keeping acronyms and tokens with digits (F5, H2O). Names that
 * already have lowercase letters are left alone.
 */
export function prettyCompanyName(raw: string): string {
  const name = raw.trim();
  if (/[a-z]/.test(name)) return name;
  return name
    .split(/\s+/)
    .map((w, i) => {
      // A word with no vowels is an acronym: GSK, NXP, CSX.
      if (KEEP_UPPER.has(w) || /\d/.test(w) || w === "&" || !/[AEIOUY]/.test(w)) return w;
      const lower = w.toLowerCase();
      if (i > 0 && LOWER.has(lower)) return lower;
      return lower
        .replace(/(^|[-.]|'(?=[a-z]{2}))([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
        .replace(/^Mc([a-z])/, (_, ch: string) => `Mc${ch.toUpperCase()}`);
    })
    .join(" ");
}

export function companyFromCatalyst(catalyst: Catalyst): Company | null {
  const p = catalyst.payload ?? {};
  const name = typeof p.full_name === "string" ? prettyCompanyName(p.full_name) : null;
  if (!name) return null;
  return {
    ticker: catalyst.ticker,
    name,
    sector: typeof p.sector === "string" ? p.sector : "",
    marketcap: typeof p.marketcap === "number" ? p.marketcap : undefined,
  };
}

export function isoDaysAgo(today: IsoDate, days: number): IsoDate {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Leaderboard eligibility: finished window, verified outcome, not an index, enough history. */
/** The kinds of news the site shows: scheduled, dated, and scored in volume. Insider and Congress rows stay internal. */
export const SITE_KINDS: ReadonlySet<string> = new Set(["fda", "earnings"]);

export function leaderboardEligible(s: EventSummary): boolean {
  return (
    SITE_KINDS.has(s.catalyst.kind) &&
    !s.partialWindow &&
    !s.flags.isIndexOrEtf &&
    !s.flags.insufficientHistory &&
    (s.verdict === "matched" || s.verdict === "missed")
  );
}

/** The home page's headline counts over the leaderboard's default 90 days. */
export function pastCounts(rows: EventSummary[], today: IsoDate, days = 90): PastCounts {
  const since = isoDaysAgo(today, days);
  const past = rows.filter((s) => leaderboardEligible(s) && s.catalyst.eventDate >= since && s.catalyst.eventDate <= today);
  const unusual = past.filter((s) => s.score >= 40);
  return { checked: past.length, unusual: unusual.length, unusualRight: unusual.filter((s) => s.verdict === "matched").length };
}

export function applyLeaderboardFilters(
  rows: EventSummary[],
  filters: LeaderboardFilters,
  today: IsoDate,
): EventSummary[] {
  const since = isoDaysAgo(today, filters.days ?? 90);
  const kind = filters.kind ?? "all";
  const out = oneShareClass(rows).filter(
    (s) =>
      leaderboardEligible(s) &&
      s.catalyst.eventDate >= since &&
      s.catalyst.eventDate <= today &&
      (kind === "all" || s.catalyst.kind === kind) &&
      (filters.minScore === undefined || s.score >= filters.minScore) &&
      (!filters.matchedOnly || s.verdict === "matched"),
  );
  const newer = (a: EventSummary, b: EventSummary) => (a.catalyst.eventDate < b.catalyst.eventDate ? 1 : a.catalyst.eventDate > b.catalyst.eventDate ? -1 : 0);
  const sort = filters.sort ?? "score";
  if (sort === "new") out.sort((a, b) => newer(a, b) || b.score - a.score);
  else if (sort === "move") out.sort((a, b) => Math.abs(b.realizedMovePct ?? 0) - Math.abs(a.realizedMovePct ?? 0) || b.score - a.score);
  else out.sort((a, b) => b.score - a.score || newer(a, b));
  return out.slice(0, filters.limit ?? 20);
}

export function hitRate(events: EventSummary[]): HitRate {
  const past = events.filter((e) => !e.partialWindow && (e.verdict === "matched" || e.verdict === "missed"));
  const strong = past.filter((e) => e.score >= 70);
  return {
    scored: past.length,
    strong: strong.length,
    matched: past.filter((e) => e.verdict === "matched").length,
    strongMatched: strong.filter((e) => e.verdict === "matched").length,
  };
}

export function toRadarItem(s: EventSummary, today: IsoDate, now: Date = new Date()): RadarItem {
  const win = footprintWindow(s.catalyst.eventDate);
  const elapsed = partialFootprintWindow(s.catalyst.eventDate, today).filter((d) => sessionStarted(d, now)).length;
  return {
    ...s,
    windowStart: win[0],
    windowOpen: elapsed > 0,
    daysElapsed: elapsed,
    daysTotal: win.length,
  };
}

/**
 * One row per company and event: GOOG and GOOGL report the same earnings, so
 * keep the share class with the higher score (the first seen on a tie).
 */
export function oneShareClass<T extends EventSummary>(items: T[]): T[] {
  const best = new Map<string, T>();
  for (const s of items) {
    const company = s.company?.name.toLowerCase().replace(/[^a-z0-9]/g, "") || s.catalyst.ticker;
    const key = `${company}:${s.catalyst.kind}:${s.catalyst.eventDate}`;
    const held = best.get(key);
    if (!held || s.score > held.score) best.set(key, s);
  }
  const keep = new Set(best.values());
  return items.filter((s) => keep.has(s));
}

export function sortRadar(items: RadarItem[]): RadarItem[] {
  return oneShareClass([...items]).sort((a, b) => {
    if (a.windowOpen !== b.windowOpen) return a.windowOpen ? -1 : 1;
    if (a.windowOpen) return b.score - a.score || a.catalyst.eventDate.localeCompare(b.catalyst.eventDate);
    return a.catalyst.eventDate.localeCompare(b.catalyst.eventDate);
  });
}

export const SCORECARD_BANDS: { min: number; max: number; label: string }[] = [
  { min: 0, max: 19, label: "0 to 19" },
  { min: 20, max: 39, label: "20 to 39" },
  { min: 40, max: 69, label: "40 to 69" },
  { min: 70, max: 100, label: "70 and up" },
];

/** Groups finished cases by kind of news and score band. Kinds with no cases are left out. */
export function buildScorecard(rows: ScorecardCase[]): Scorecard {
  const kinds = new Map<ScorecardCase["kind"], ScorecardCase[]>();
  for (const r of rows) {
    if (r.verdict !== "matched" && r.verdict !== "missed") continue;
    if (!SITE_KINDS.has(r.kind)) continue;
    const list = kinds.get(r.kind) ?? [];
    list.push(r);
    kinds.set(r.kind, list);
  }
  const out: Scorecard["kinds"] = [];
  for (const [kind, list] of kinds) {
    const bands: ScorecardBand[] = SCORECARD_BANDS.map(({ min, max, label }) => {
      const inBand = list.filter((r) => Math.round(r.score) >= min && Math.round(r.score) <= max);
      const leaned = inBand.filter((r) => r.direction !== "mixed" && r.realizedMovePct !== null);
      return {
        min,
        max,
        label,
        cases: inBand.length,
        right: inBand.filter((r) => r.verdict === "matched").length,
        movedMore: inBand.filter(
          (r) => r.realizedMovePct !== null && r.impliedMovePct !== null && r.impliedMovePct > 0 && Math.abs(r.realizedMovePct) >= r.impliedMovePct,
        ).length,
        leaned: leaned.length,
        leanedRight: leaned.filter((r) => (r.direction === "bullish") === (r.realizedMovePct! > 0)).length,
      };
    });
    out.push({ kind, cases: list.length, bands });
  }
  out.sort((a, b) => b.cases - a.cases);
  return { cases: out.reduce((n, k) => n + k.cases, 0), kinds: out };
}

/** Finished, ranked cases as scorecard rows. */
export function scorecardCases(rows: EventSummary[]): ScorecardCase[] {
  return rows.filter(leaderboardEligible).map((s) => ({
    kind: s.catalyst.kind,
    score: s.score,
    direction: s.direction,
    verdict: s.verdict,
    realizedMovePct: s.realizedMovePct,
    impliedMovePct: s.impliedMovePct,
  }));
}
