import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { summarizeDossier } from "../src/dossier";
import { NarratorError } from "../src/errors";
import { fakeClient, parsedMessage } from "./fixtures";

type ParseParams = Anthropic.MessageCreateParamsNonStreaming;

const input = {
  ticker: "XYZ",
  events: [{ eventDate: "2025-10-14", kind: "fda", title: "PDUFA", score: 84.3, direction: "bearish", verdict: "matched", realizedMovePct: -18.6 }],
  hitRate: { scored: 4, strong: 2, matched: 1 },
};

describe("summarizeDossier", () => {
  it("returns the summary and model, and gives Claude the precomputed percentages", async () => {
    const { client, calls } = fakeClient({ parse: () => parsedMessage({ summary: "  XYZ is a repeat offender. " }) });
    const result = await summarizeDossier(input, { client, model: "claude-sonnet-5-5" });
    expect(result).toEqual({ summary: "XYZ is a repeat offender.", model: "claude-sonnet-5-5" });
    const params = calls[0].params as ParseParams;
    expect(params.output_config?.effort).toBe("low");
    expect(params.max_tokens).toBe(2048);
    expect(String(params.messages[0].content)).toContain('"matchRatePct": 50');
    expect(String(params.messages[0].content)).toContain('"strongSharePct": 50');
  });

  it("throws NarratorError when no structured output comes back", async () => {
    const { client } = fakeClient({ parse: () => parsedMessage(null, "max_tokens") });
    await expect(summarizeDossier(input, { client })).rejects.toBeInstanceOf(NarratorError);
  });
});
