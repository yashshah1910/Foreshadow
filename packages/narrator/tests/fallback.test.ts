import { describe, expect, it } from "vitest";
import { CAPTION_MAX_LENGTH, fallbackDossierSummary, fallbackNarration, formatMoney, formatPct } from "../src/fallback";
import type { DossierInput } from "../src/types";
import { verifyNumbers } from "../src/verify";
import { sampleInput } from "./fixtures";

function sentences(text: string): string[] {
  return text.split(/(?<=\.)\s+(?=[A-Z])/).filter(Boolean);
}

describe("fallbackNarration", () => {
  it("states score, direction and verdict in exactly three verified sentences", () => {
    const input = sampleInput();
    const n = fallbackNarration(input);
    expect(n.story).toContain("scored 84, very unusual for this stock");
    expect(n.story).toContain("leaned toward bets on a fall");
    expect(n.story).toContain("$4.1M");
    expect(n.story).toContain("$150");
    expect(n.story).toContain("at 14:32 UTC on Oct 9");
    expect(n.story).toContain("11.2%");
    expect(n.story).toContain("fell 18.6%");
    expect(n.story).toContain("so the bets were right");
    expect(n.story).not.toMatch(/someone-knew|bearish|bullish|footprint|signal|catalyst|ask-side|z-score/);
    expect(sentences(n.story)).toHaveLength(3);
    expect(n.numbersVerified).toBe(true);
    expect(n.unverifiedNumbers).toEqual([]);
    expect(n.model).toBe("fallback");
    expect(verifyNumbers(`${n.story}\n${n.caption}`, input).numbersVerified).toBe(true);
  });

  it("writes a short caption without hashtags", () => {
    const n = fallbackNarration(sampleInput());
    expect(n.caption.length).toBeLessThanOrEqual(CAPTION_MAX_LENGTH);
    expect(n.caption).not.toContain("#");
    expect(n.caption).toContain("on the stock falling");
    expect(n.caption).toContain("so the bets were right");
  });

  it("never throws on empty alerts, empty signals and no verdict", () => {
    const input = { ...sampleInput(), signals: [], topAlerts: [], verdict: undefined };
    const n = fallbackNarration(input);
    expect(n.story).toContain("No single large trade stood out");
    expect(n.story).toContain("too early to say");
    expect(sentences(n.story)).toHaveLength(3);
    expect(n.caption.length).toBeLessThanOrEqual(CAPTION_MAX_LENGTH);
    expect(verifyNumbers(`${n.story}\n${n.caption}`, input).numbersVerified).toBe(true);
  });

  it("mentions flags, missed verdicts and insufficient data", () => {
    const flagged = {
      ...sampleInput(),
      flags: { insufficientHistory: true, multiCatalyst: true, partialWindow: true, isIndexOrEtf: true },
      verdict: { verdict: "missed" as const, realizedMovePct: 2.1, impliedMovePct: null, reactionWindow: "T+1" as const },
    };
    const n = fallbackNarration(flagged);
    expect(n.story).toContain("the week isn't over yet");
    expect(n.story).toContain("little trading history");
    expect(n.story).toContain("other news fell in the same week");
    expect(n.story).toContain("a fund, not a single company");
    expect(n.story).not.toContain("z-score");
    expect(n.story).toContain("rose 2.1% the next day");
    expect(n.story).toContain("so the bets were wrong");
    expect(verifyNumbers(`${n.story}\n${n.caption}`, flagged).numbersVerified).toBe(true);

    const insufficient = { ...sampleInput(), verdict: { ...flagged.verdict, verdict: "insufficient" as const } };
    expect(fallbackNarration(insufficient).story).toContain("enough price data");
  });
});

describe("formatters", () => {
  it("round money and percentages the way the verifier expects", () => {
    expect(formatMoney(4_120_000)).toBe("$4.1M");
    expect(formatMoney(850_400)).toBe("$850K");
    expect(formatMoney(1_250_000_000)).toBe("$1.3B");
    expect(formatMoney(420)).toBe("$420");
    expect(formatMoney(-1500)).toBe("-$2K");
    expect(formatPct(-18.6)).toBe("18.6%");
  });
});

describe("fallbackDossierSummary", () => {
  const dossier: DossierInput = {
    ticker: "XYZ",
    events: [
      { eventDate: "2025-10-14", kind: "fda", title: "PDUFA for drug ABC", score: 84.3, direction: "bearish", verdict: "matched", realizedMovePct: -18.6 },
      { eventDate: "2025-07-30", kind: "earnings", title: "Q2 earnings", score: 71, direction: "bullish", verdict: "matched", realizedMovePct: 6.4 },
      { eventDate: "2025-04-29", kind: "earnings", title: "Q1 earnings", score: 22, direction: "mixed", verdict: "missed", realizedMovePct: -1.1 },
    ],
    hitRate: { scored: 3, strong: 2, matched: 2 },
  };

  it("states the track record, the top case and its result in plain words", () => {
    const s = fallbackDossierSummary(dossier);
    expect(s).toContain("scored the betting before 3 pieces of XYZ news");
    expect(s).toContain("very unusual 2 times, and 2 of those bets were right");
    expect(s).toContain("That is a pattern");
    expect(s).toContain("a score of 84 with bets on a fall");
    expect(s).toContain("the bets were right: the stock fell 18.6%");
    expect(s).not.toMatch(/someone-knew|repeat offender|footprint|bearish|bullish|catalyst/);
    expect(verifyNumbers(s, dossier).numbersVerified).toBe(true);
  });

  it("classifies weaker records and never throws on empty events", () => {
    expect(fallbackDossierSummary({ ...dossier, hitRate: { scored: 3, strong: 1, matched: 0 } })).toContain("Worth watching");
    expect(fallbackDossierSummary({ ...dossier, hitRate: { scored: 3, strong: 0, matched: 0 } })).toContain("no sign of a pattern");
    const empty = fallbackDossierSummary({ ticker: "ABC", events: [], hitRate: { scored: 0, strong: 0, matched: 0 } });
    expect(empty).toContain("ABC has no scored news");
    const single = fallbackDossierSummary({ ...dossier, events: [dossier.events[0]], hitRate: { scored: 1, strong: 1, matched: 1 } });
    expect(single).toContain("before 1 piece of XYZ news");
    expect(single).not.toContain("Most recently");
  });
});
