/**
 * Pure number verification: every numeric token in Claude's prose must be
 * traceable to the input it was given. No SDK imports, no I/O.
 */

export type NumericTokenKind = "date" | "time" | "money" | "percent" | "number";

export interface NumericToken {
  /** The matched text, e.g. "$4.1M", "19%", "2025-10-14", "14:32". */
  raw: string;
  kind: NumericTokenKind;
  /** Scalar value (already multiplied by K/M/B); 0 for dates and times. */
  value: number;
  /** Decimal places shown before the multiplier; drives rounding tolerance. */
  decimals: number;
  multiplier: number;
  date?: { year?: number; month: number; day: number };
  time?: { hour: number; minute: number; explicitMeridiem: boolean };
}

export interface Haystack {
  numbers: number[];
  dates: NonNullable<NumericToken["date"]>[];
  times: NonNullable<NumericToken["time"]>[];
}

export interface VerificationResult {
  numbersVerified: boolean;
  unverifiedNumbers: string[];
  tokens: NumericToken[];
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const MONTH_NO_MAY = MONTH.replace("may|", "");
const INT = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)";

const ALTERNATIVES = [
  // ISO date with optional time: 2025-10-14, 2025-10-14T14:32:00Z
  `(?<iso>\\d{4}-\\d{2}-\\d{2})(?:[T ](?<isoH>\\d{2}):(?<isoM>\\d{2})(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:?\\d{2})?)?`,
  // Month-name first: Oct 14, October 14th, 2025
  `(?<mn>${MONTH})\\.?\\s+(?<md>\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(?<my>\\d{4}))?`,
  // Day first: 14 Oct 2025 ("may" excluded: too often a verb)
  `(?<dd>\\d{1,2})\\s+(?<dm>${MONTH_NO_MAY})\\.?(?:,?\\s+(?<dy>\\d{4}))?`,
  // Numeric date: 10/14/2025, 10/14
  `(?<nm>\\d{1,2})/(?<nd>\\d{1,2})(?:/(?<ny>\\d{4}|\\d{2}))?`,
  // Time: 14:32, 14:32:00, 2:32 PM, 9:41am
  `(?<th>\\d{1,2}):(?<tm>\\d{2})(?::\\d{2})?(?:\\s?(?<ap>[ap])\\.?m\\.?)?`,
  // Scaled money: $4.1M, 850K, $2.3 million, 1.2bn
  `(?<ms>-?)\\$?(?<mi>${INT})(?:\\.(?<mf>\\d+))?(?:(?<s1>[kmb]|mm|bn)|\\s?(?<s2>million|billion|thousand))`,
  // Plain money: $150, $4,120,000.50
  `\\$(?<pi>${INT})(?:\\.(?<pf>\\d+))?`,
  // Percent: 19%, -19.0%, 19 percent
  `(?<pc>-?${INT}(?:\\.\\d+)?)\\s?(?:%|percent|pct)`,
  // Ordinals are consumed but not reported: 3rd, 21st
  `(?<ord>\\d+)(?:st|nd|rd|th)`,
  // Plain number with optional ratio suffix: 84, 3.2, 1,200, 3x
  `(?<pn>-?${INT}(?:\\.\\d+)?)(?<px>x)?`,
];

/** Not glued to a word, identifier or decimal on either side (so "Q3", "v2", "T-5" -> "5"). */
const TOKEN_RE = new RegExp(`(?<![A-Za-z0-9.])(?:${ALTERNATIVES.join("|")})(?![A-Za-z0-9])`, "gi");

const MULTIPLIERS: Record<string, number> = {
  k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9,
};

function toNumber(text: string): number {
  return Number(text.replace(/,/g, ""));
}

/** `shown * multiplier` without binary drift: "4.1" x 1e6 is exactly 4,100,000. */
function scale(shown: string, multiplier: number): number {
  const decimals = decimalsOf(shown);
  const digits = Number(shown.replace(/[,.]/g, ""));
  const exponent = Math.round(Math.log10(multiplier)) - decimals;
  return exponent >= 0 ? digits * 10 ** exponent : digits / 10 ** -exponent;
}

function decimalsOf(text: string): number {
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

function monthIndex(name: string): number {
  return MONTHS[name.slice(0, 3).toLowerCase()] ?? 0;
}

function yearOf(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const n = Number(text);
  return text.length === 2 ? 2000 + n : n;
}

function tokensFromMatch(m: RegExpExecArray): NumericToken[] {
  const g = m.groups ?? {};
  const raw = m[0];
  const base = { raw, value: 0, decimals: 0, multiplier: 1 };
  if (g.iso) {
    const [y, mo, d] = g.iso.split("-").map(Number);
    const out: NumericToken[] = [{ ...base, kind: "date", date: { year: y, month: mo, day: d } }];
    if (g.isoH !== undefined) {
      out.push({
        ...base,
        kind: "time",
        time: { hour: Number(g.isoH), minute: Number(g.isoM), explicitMeridiem: true },
      });
    }
    return out;
  }
  if (g.mn) return [{ ...base, kind: "date", date: { year: yearOf(g.my), month: monthIndex(g.mn), day: Number(g.md) } }];
  if (g.dm) return [{ ...base, kind: "date", date: { year: yearOf(g.dy), month: monthIndex(g.dm), day: Number(g.dd) } }];
  if (g.nm) return [{ ...base, kind: "date", date: { year: yearOf(g.ny), month: Number(g.nm), day: Number(g.nd) } }];
  if (g.th) {
    let hour = Number(g.th);
    const ap = g.ap?.toLowerCase();
    if (ap === "p" && hour < 12) hour += 12;
    if (ap === "a" && hour === 12) hour = 0;
    return [{ ...base, kind: "time", time: { hour, minute: Number(g.tm), explicitMeridiem: ap !== undefined } }];
  }
  if (g.mi) {
    const multiplier = MULTIPLIERS[(g.s1 ?? g.s2 ?? "").toLowerCase()] ?? 1;
    const shown = `${g.mi}${g.mf ? `.${g.mf}` : ""}`;
    const value = (g.ms === "-" ? -1 : 1) * scale(shown, multiplier);
    return [{ ...base, kind: "money", value, decimals: g.mf?.length ?? 0, multiplier }];
  }
  if (g.pi) {
    const shown = `${g.pi}${g.pf ? `.${g.pf}` : ""}`;
    return [{ ...base, kind: "money", value: toNumber(shown), decimals: g.pf?.length ?? 0 }];
  }
  if (g.pc) return [{ ...base, kind: "percent", value: toNumber(g.pc), decimals: decimalsOf(g.pc) }];
  if (g.ord) return [];
  if (g.pn) return [{ ...base, kind: "number", value: toNumber(g.pn), decimals: decimalsOf(g.pn) }];
  return [];
}

/** Every numeric token in `text`, in order. Ordinals ("3rd") and digits glued to words ("Q3") are skipped. */
export function extractNumbers(text: string): NumericToken[] {
  const out: NumericToken[] = [];
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(text); m !== null; m = TOKEN_RE.exec(text)) {
    out.push(...tokensFromMatch(m));
  }
  return out;
}

/** Collect every number, date and time reachable in `input` (numbers inside strings included). */
export function buildHaystack(input: unknown): Haystack {
  const hay: Haystack = { numbers: [], dates: [], times: [] };
  const visit = (value: unknown): void => {
    if (typeof value === "number") {
      if (Number.isFinite(value)) hay.numbers.push(value);
    } else if (typeof value === "string") {
      for (const token of extractNumbers(value)) {
        if (token.date) {
          hay.dates.push(token.date);
          if (token.date.year !== undefined) hay.numbers.push(token.date.year);
        } else if (token.time) {
          hay.times.push(token.time);
        } else {
          hay.numbers.push(token.value);
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(visit);
    }
  };
  visit(input);
  return hay;
}

/** Half a unit of the last shown digit: "$4.1M" tolerates +/-50,000; "84" tolerates +/-0.5. */
function tolerance(token: NumericToken): number {
  return 0.5 * 10 ** -token.decimals * token.multiplier + 1e-9;
}

function near(candidate: number, target: number, tol: number): boolean {
  return Math.abs(Math.abs(candidate) - Math.abs(target)) <= tol;
}

/** Whether `token` is supported by the haystack (rounding allowed, sign ignored). */
export function tokenMatches(token: NumericToken, hay: Haystack): boolean {
  if (token.date) {
    const t = token.date;
    return hay.dates.some(
      (d) => d.month === t.month && d.day === t.day && (t.year === undefined || d.year === undefined || d.year === t.year),
    );
  }
  if (token.time) {
    const t = token.time;
    return hay.times.some(
      (h) => h.minute === t.minute && (h.hour === t.hour || (!t.explicitMeridiem && t.hour < 12 && h.hour === t.hour + 12)),
    );
  }
  const tol = tolerance(token);
  if (token.kind === "percent") {
    return hay.numbers.some((n) => near(n, token.value, tol) || near(n * 100, token.value, tol));
  }
  return hay.numbers.some((n) => near(n, token.value, tol));
}

/** Verify that every figure in `text` appears (up to rounding) somewhere in `input`. */
export function verifyNumbers(text: string, input: unknown): VerificationResult {
  const hay = buildHaystack(input);
  const tokens = extractNumbers(text);
  const unverified: string[] = [];
  for (const token of tokens) {
    if (tokenMatches(token, hay)) continue;
    const key = token.raw.trim();
    if (!unverified.some((u) => u.toLowerCase() === key.toLowerCase())) unverified.push(key);
  }
  return { numbersVerified: unverified.length === 0, unverifiedNumbers: unverified, tokens };
}
