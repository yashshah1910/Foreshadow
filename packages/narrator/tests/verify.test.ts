import { describe, expect, it } from "vitest";
import { buildHaystack, extractNumbers, verifyNumbers } from "../src/verify";
import { sampleInput } from "./fixtures";

function kinds(text: string): string[] {
  return extractNumbers(text).map((t) => `${t.kind}:${t.raw}`);
}

describe("extractNumbers", () => {
  it("parses K/M/B money with rounding precision", () => {
    const [m] = extractNumbers("$4.1M of puts");
    expect(m).toMatchObject({ kind: "money", value: 4_100_000, decimals: 1, multiplier: 1e6, raw: "$4.1M" });
    expect(extractNumbers("850K")[0]).toMatchObject({ kind: "money", value: 850_000, decimals: 0, multiplier: 1e3 });
    expect(extractNumbers("$2.3 million")[0]).toMatchObject({ kind: "money", value: 2_300_000, decimals: 1 });
    expect(extractNumbers("1.2bn")[0]).toMatchObject({ kind: "money", value: 1_200_000_000, decimals: 1 });
    expect(extractNumbers("$4,120,000")[0]).toMatchObject({ kind: "money", value: 4_120_000, decimals: 0, multiplier: 1 });
  });

  it("parses percentages, negatives and strikes", () => {
    expect(extractNumbers("fell 19%")[0]).toMatchObject({ kind: "percent", value: 19, decimals: 0 });
    expect(extractNumbers("-19.0%")[0]).toMatchObject({ kind: "percent", value: -19, decimals: 1, raw: "-19.0%" });
    expect(extractNumbers("11.2 percent")[0]).toMatchObject({ kind: "percent", value: 11.2 });
    expect(extractNumbers("the $150 strike")[0]).toMatchObject({ kind: "money", value: 150, decimals: 0 });
    expect(extractNumbers("size 1,200")[0]).toMatchObject({ kind: "number", value: 1200 });
    expect(extractNumbers("3x baseline")[0]).toMatchObject({ kind: "number", value: 3, raw: "3x" });
    expect(extractNumbers("Score 84, bearish")[0]).toMatchObject({ kind: "number", value: 84, raw: "84" });
  });

  it("parses dates and times as single tokens", () => {
    expect(extractNumbers("on 2025-10-14")[0]).toMatchObject({ kind: "date", date: { year: 2025, month: 10, day: 14 } });
    const stamp = extractNumbers("2025-10-09T14:32:00Z");
    expect(stamp).toHaveLength(2);
    expect(stamp[0]).toMatchObject({ kind: "date", date: { year: 2025, month: 10, day: 9 } });
    expect(stamp[1]).toMatchObject({ kind: "time", time: { hour: 14, minute: 32 } });
    expect(extractNumbers("Oct 14")[0]).toMatchObject({ kind: "date", date: { month: 10, day: 14 } });
    expect(extractNumbers("October 14th, 2025")[0]).toMatchObject({ kind: "date", date: { year: 2025, month: 10, day: 14 } });
    expect(extractNumbers("14 Oct 2025")[0]).toMatchObject({ kind: "date", date: { year: 2025, month: 10, day: 14 } });
    expect(extractNumbers("10/14/2025")[0]).toMatchObject({ kind: "date", date: { year: 2025, month: 10, day: 14 } });
    expect(extractNumbers("at 14:32 UTC")[0]).toMatchObject({ kind: "time", time: { hour: 14, minute: 32 } });
    expect(extractNumbers("at 2:32 PM")[0]).toMatchObject({ kind: "time", time: { hour: 14, minute: 32, explicitMeridiem: true } });
    expect(extractNumbers("12:05am")[0]).toMatchObject({ kind: "time", time: { hour: 0, minute: 5 } });
    expect(kinds("at 14:32 the stock")).toEqual(["time:14:32"]);
  });

  it("skips ordinals and digits glued to words, keeps digits after symbols", () => {
    expect(extractNumbers("the 3rd largest, 21st century, 2nd")).toEqual([]);
    expect(extractNumbers("Q3 earnings, v2 model, H1")).toEqual([]);
    expect(kinds("window T+1 and T-5")).toEqual(["number:1", "number:5"]);
    expect(kinds("three days before")).toEqual([]);
  });

  it("extracts every token in order", () => {
    expect(kinds("Score 84. $4.1M puts at $150 expiring 2025-11-21, stock fell 19%.")).toEqual([
      "number:84",
      "money:$4.1M",
      "money:$150",
      "date:2025-11-21",
      "percent:19%",
    ]);
  });
});

describe("buildHaystack", () => {
  it("collects nested numbers and numbers inside strings", () => {
    const hay = buildHaystack({ a: 1, b: { c: [2, "T+1", "2025-10-14T14:32:00Z"] }, d: "n/a", e: null, f: true });
    expect(hay.numbers).toEqual([1, 2, 1, 2025]);
    expect(hay.dates).toEqual([{ year: 2025, month: 10, day: 14 }]);
    expect(hay.times).toEqual([{ hour: 14, minute: 32, explicitMeridiem: true }]);
  });
});

describe("verifyNumbers", () => {
  const input = sampleInput();

  it("accepts rounded money, percentages and integers", () => {
    expect(verifyNumbers("$4.1M of puts", input).numbersVerified).toBe(true);
    expect(verifyNumbers("$4M of puts", input).numbersVerified).toBe(true);
    expect(verifyNumbers("$4.12M of puts", input).numbersVerified).toBe(true);
    expect(verifyNumbers("$850K of puts", input).numbersVerified).toBe(true);
    expect(verifyNumbers("fell 19%", input).numbersVerified).toBe(true);
    expect(verifyNumbers("moved -18.6%", input).numbersVerified).toBe(true);
    expect(verifyNumbers("Score 84", input).numbersVerified).toBe(true);
    expect(verifyNumbers("Score 84.3", input).numbersVerified).toBe(true);
    expect(verifyNumbers("the $150 strike, 1,200 contracts", input).numbersVerified).toBe(true);
    expect(verifyNumbers("z-score 3.2 and 2.7", input).numbersVerified).toBe(true);
  });

  it("rejects figures outside rounding tolerance", () => {
    expect(verifyNumbers("$4.2M of puts", input).unverifiedNumbers).toEqual(["$4.2M"]);
    expect(verifyNumbers("$9.9M of puts", input).unverifiedNumbers).toEqual(["$9.9M"]);
    expect(verifyNumbers("fell 17%", input).numbersVerified).toBe(true); // 16.9 contribution rounds to 17
    expect(verifyNumbers("fell 23%", input).unverifiedNumbers).toEqual(["23%"]);
    expect(verifyNumbers("Score 85", input).unverifiedNumbers).toEqual(["85"]);
    expect(verifyNumbers("the $155 strike", input).unverifiedNumbers).toEqual(["$155"]);
    expect(verifyNumbers("2,000 contracts", input).numbersVerified).toBe(false);
  });

  it("matches percentages against fractions", () => {
    expect(verifyNumbers("72% of flow", { putShare: 0.72 }).numbersVerified).toBe(true);
    expect(verifyNumbers("72% of flow", { putShare: 0.7 }).numbersVerified).toBe(false);
    expect(verifyNumbers("19%", { move: 18.6 }).numbersVerified).toBe(true);
    expect(verifyNumbers("19%", { move: 18.4 }).numbersVerified).toBe(false);
  });

  it("matches dates and times in several written forms", () => {
    expect(verifyNumbers("on 2025-10-14", input).numbersVerified).toBe(true);
    expect(verifyNumbers("on Oct 14", input).numbersVerified).toBe(true);
    expect(verifyNumbers("on October 14, 2025", input).numbersVerified).toBe(true);
    expect(verifyNumbers("on 10/14/2025", input).numbersVerified).toBe(true);
    expect(verifyNumbers("on Oct 15", input).unverifiedNumbers).toEqual(["Oct 15"]);
    expect(verifyNumbers("on 2024-10-14", input).numbersVerified).toBe(false);
    expect(verifyNumbers("at 14:32", input).numbersVerified).toBe(true);
    expect(verifyNumbers("at 2:32 PM", input).numbersVerified).toBe(true);
    expect(verifyNumbers("at 2:32", input).numbersVerified).toBe(true);
    expect(verifyNumbers("at 2:32 AM", input).numbersVerified).toBe(false);
    expect(verifyNumbers("at 14:35", input).unverifiedNumbers).toEqual(["14:35"]);
    expect(verifyNumbers("in 2025", input).numbersVerified).toBe(true);
  });

  it("does not verify counts that are not in the input", () => {
    const small = { score: 84, premium: 4_120_000 };
    expect(verifyNumbers("Written in 3 sentences", small).unverifiedNumbers).toEqual(["3"]);
    expect(verifyNumbers("Written in 3 sentences", { ...small, n: 3 }).numbersVerified).toBe(true);
    expect(verifyNumbers("Written in three sentences", small).numbersVerified).toBe(true);
    expect(verifyNumbers("5-day window", small).numbersVerified).toBe(false);
  });

  it("lists each unverified figure once and keeps the verified ones out", () => {
    const result = verifyNumbers("$9.9M then $9.9M again, plus 23% and 84", input);
    expect(result.unverifiedNumbers).toEqual(["$9.9M", "23%"]);
    expect(result.numbersVerified).toBe(false);
    expect(result.tokens).toHaveLength(4);
  });

  it("passes when the text has no numbers at all", () => {
    expect(verifyNumbers("Someone knew.", input)).toMatchObject({ numbersVerified: true, unverifiedNumbers: [] });
  });
});
