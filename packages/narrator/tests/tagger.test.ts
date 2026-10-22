import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { tagCatalysts } from "../src/tagger";
import type { TaggerRow } from "../src/types";
import { fakeClient, parsedMessage } from "./fixtures";

type ParseParams = Anthropic.MessageCreateParamsNonStreaming;

function rows(n: number): TaggerRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    source: "potus" as const,
    text: `Row ${i}`,
    date: "2025-10-14",
  }));
}

describe("tagCatalysts", () => {
  it("returns one normalized row per input row, in input order", async () => {
    const { client, calls } = fakeClient({
      parse: () =>
        parsedMessage({
          rows: [
            { id: "r1", tickers: [{ ticker: " lmt ", confidence: 1.4, reason: "defense budget" }], sectors: ["Defense", "Defense"], relevance: 0.7 },
            { id: "r0", tickers: [{ ticker: "spy", confidence: 0.3, reason: "macro" }, { ticker: "not a ticker", confidence: 0.9, reason: "x" }], sectors: ["Macro"], relevance: -1 },
          ],
        }),
    });
    const tagged = await tagCatalysts(rows(3), { client });
    expect(tagged.map((r) => r.id)).toEqual(["r0", "r1", "r2"]);
    expect(tagged[0]).toEqual({ id: "r0", tickers: [{ ticker: "SPY", confidence: 0.3, reason: "macro" }], sectors: ["Macro"], relevance: 0 });
    expect(tagged[1]).toEqual({ id: "r1", tickers: [{ ticker: "LMT", confidence: 1, reason: "defense budget" }], sectors: ["Defense"], relevance: 0.7 });
    expect(tagged[2]).toEqual({ id: "r2", tickers: [], sectors: [], relevance: 0 });
    const params = calls[0].params as ParseParams;
    expect(params.max_tokens).toBe(2048);
    expect(params.output_config?.effort).toBe("low");
    expect(params.system).toEqual([expect.objectContaining({ cache_control: { type: "ephemeral" } })]);
  });

  it("chunks beyond 40 rows and makes no call for an empty list", async () => {
    const { client, calls } = fakeClient({ parse: () => parsedMessage({ rows: [] }) });
    expect(await tagCatalysts([], { client })).toEqual([]);
    expect(calls).toHaveLength(0);
    const tagged = await tagCatalysts(rows(41), { client });
    expect(tagged).toHaveLength(41);
    expect(calls).toHaveLength(2);
    expect(String((calls[0].params as ParseParams).messages[0].content)).toContain("Tag these 40 calendar rows");
    expect(String((calls[1].params as ParseParams).messages[0].content)).toContain("Tag these 1 calendar rows");
  });
});
