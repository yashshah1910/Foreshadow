import { describe, expect, it } from "vitest";
import { largestTrades, toTradeExample, type FlowAlert } from "../src";

function alert(id: string, premium: number, executedAt: string): FlowAlert {
  return {
    id,
    ticker: "ACME",
    tradeDate: executedAt.slice(0, 10),
    executedAt,
    type: "put",
    strike: 25,
    expiry: "2026-11-20",
    premium,
    size: 300,
    side: "bid",
    isSweep: false,
    volume: 333,
    openInterest: 5,
    underlyingPrice: 71.7,
    rule: "RepeatedHits",
  };
}

describe("toTradeExample", () => {
  it("drops ids, rule names and every other raw field, keeping whether it was bought or sold", () => {
    const t = toTradeExample(alert("792a03e1", 309_060, "2026-09-22T16:54:27Z"));
    expect(t).toEqual({ tradeDate: "2026-09-22", type: "put", strike: 25, expiry: "2026-11-20", premium: 309_060, isSweep: false, side: "bid" });
  });
});

describe("largestTrades", () => {
  it("takes the largest by amount, earliest first on ties", () => {
    const rows = largestTrades(
      [alert("a", 10, "2026-09-21T15:00:00Z"), alert("b", 30, "2026-09-22T15:00:00Z"), alert("c", 30, "2026-09-18T15:00:00Z")],
      2,
    );
    expect(rows.map((r) => [r.premium, r.tradeDate])).toEqual([
      [30, "2026-09-18"],
      [30, "2026-09-22"],
    ]);
  });
});
