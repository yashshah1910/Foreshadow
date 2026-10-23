import { describe, expect, it } from "vitest";
import { prettyCompanyName } from "@/lib/data/shared";

describe("prettyCompanyName", () => {
  it.each([
    ["PROCTER & GAMBLE", "Procter & Gamble"],
    ["BANK OF NT BUTTERFIELD & SON", "Bank of NT Butterfield & Son"],
    ["ALLIANCE RESOURCE PARTNERS LP", "Alliance Resource Partners LP"],
    ["MCDONALD'S", "McDonald's"],
    ["O'REILLY AUTOMOTIVE", "O'Reilly Automotive"],
    ["T-MOBILE US", "T-Mobile US"],
    ["F5", "F5"],
    ["GSK", "GSK"],
    ["NXP SEMICONDUCTORS", "NXP Semiconductors"],
  ])("title-cases %s", (raw, want) => {
    expect(prettyCompanyName(raw)).toBe(want);
  });

  it("leaves names that already have lowercase letters alone", () => {
    expect(prettyCompanyName("H2O America")).toBe("H2O America");
    expect(prettyCompanyName("Flagstar Financial")).toBe("Flagstar Financial");
  });
});
