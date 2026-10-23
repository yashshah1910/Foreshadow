import { describe, expect, it } from "vitest";
import { percentBelow, rankPhrase, stockRankPhrase, topShare } from "@/lib/rank";

const hundred = Array.from({ length: 100 }, (_, i) => i); // 0..99

describe("ranks", () => {
  it("counts the share of scores below", () => {
    expect(percentBelow(0, hundred)).toBe(0);
    expect(percentBelow(50, hundred)).toBe(50);
    expect(percentBelow(97.5, hundred)).toBe(98);
    expect(percentBelow(500, hundred)).toBe(100);
    expect(percentBelow(10, [])).toBe(0);
  });

  it("only names a top share in the top quarter, and never 'top 0%'", () => {
    expect(topShare(97, hundred)).toBe("top 3%");
    expect(topShare(1000, hundred)).toBe("top 1%");
    expect(topShare(75, hundred)).toBe("top 25%");
    expect(topShare(60, hundred)).toBeNull();
    expect(topShare(90, [1, 2, 3])).toBeNull();
  });

  it("phrases the rank among all cases and among the stock's own", () => {
    expect(rankPhrase(97, hundred, "earnings")).toBe("busier than 97% of 100 finished earnings cases");
    expect(stockRankPhrase(40, [10, 20, 30], "TSLA")).toBe("the busiest of TSLA's 3 other finished cases");
    expect(stockRankPhrase(25, [10, 20, 30, 50], "TSLA")).toBe("busier than 2 of TSLA's 4 other finished cases");
    expect(stockRankPhrase(5, [10, 20, 30], "TSLA")).toBe("the quietest of TSLA's 3 other finished cases");
    expect(stockRankPhrase(5, [10, 20], "TSLA")).toBeNull();
  });
});
