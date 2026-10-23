import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { investigate } from "../src/investigate";
import { FORESHADOW_TOOL_DEFINITIONS } from "../src/tools";
import type { ForeshadowTools } from "../src/types";
import { fakeClient, message, text, toolUse } from "./fixtures";

type CreateParams = Anthropic.MessageCreateParamsNonStreaming;
type BetaCreateParams = Anthropic.Beta.MessageCreateParamsNonStreaming;

function makeTools(): { tools: ForeshadowTools; scoreCalls: unknown[] } {
  const scoreCalls: unknown[] = [];
  const tools: ForeshadowTools = {
    foreshadow_score: async (args) => {
      scoreCalls.push(args);
      return { ticker: args.ticker, eventDate: args.eventDate, score: 84.3, direction: "bearish" };
    },
    foreshadow_radar: async () => [{ ticker: "ABC", score: 71 }],
    foreshadow_history: async () => {
      throw new Error("database offline");
    },
    foreshadow_scorecard: async () => ({ cases: 0, kinds: [] }),
    foreshadow_similar: async () => ({ similarCases: 0 }),
  };
  return { tools, scoreCalls };
}

describe("investigate (Foreshadow tools only)", () => {
  it("runs the injected tool, feeds the result back and records the call", async () => {
    const { tools, scoreCalls } = makeTools();
    const { client, calls } = fakeClient({
      create: (_params, nth) =>
        nth === 1
          ? message([text("Let me check."), toolUse("tu_1", "foreshadow_score", { ticker: "XYZ", eventDate: "2025-10-14" })], "tool_use")
          : message([text("XYZ scored 84.3, bearish.\n\nEvidence:\n- foreshadow_score: 84.3")]),
    });
    const result = await investigate(
      { question: "How did XYZ score?", context: { ticker: "XYZ", eventDate: "2025-10-14" }, tools },
      { client, model: "claude-haiku-5-5" },
    );
    expect(scoreCalls).toEqual([{ ticker: "XYZ", eventDate: "2025-10-14" }]);
    expect(result.stopped).toBe("end_turn");
    expect(result.model).toBe("claude-haiku-5-5");
    expect(result.answer).toContain("XYZ scored 84.3");
    expect(result.toolCalls).toEqual([
      {
        name: "foreshadow_score",
        input: { ticker: "XYZ", eventDate: "2025-10-14" },
        output: JSON.stringify({ ticker: "XYZ", eventDate: "2025-10-14", score: 84.3, direction: "bearish" }),
        source: "foreshadow",
        ok: true,
      },
    ]);
    expect(calls.map((c) => c.method)).toEqual(["create", "create"]);

    const first = calls[0].params as CreateParams;
    expect(first.max_tokens).toBe(8192);
    expect(first.output_config?.effort).toBe("low");
    expect(first.tool_choice).toEqual({ type: "auto" });
    expect(first.tools).toEqual(FORESHADOW_TOOL_DEFINITIONS);
    expect(first.system).toEqual([expect.objectContaining({ cache_control: { type: "ephemeral" } })]);
    expect(first.messages).toHaveLength(1);
    expect(String(first.messages[0].content)).toContain("Ticker in view: XYZ");
    expect(String(first.messages[0].content)).toContain("Question: How did XYZ score?");

    const second = calls[1].params as CreateParams;
    expect(second.messages).toHaveLength(3);
    expect(second.messages[1].role).toBe("assistant");
    expect(second.messages[2]).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_1",
          content: result.toolCalls[0].output,
          is_error: false,
        },
      ],
    });
  });

  it("stops at the tool cap and asks for a final answer with tool_choice none", async () => {
    const { tools, scoreCalls } = makeTools();
    const { client, calls } = fakeClient({
      create: (params, nth) =>
        (params as CreateParams).tool_choice?.type === "none"
          ? message([text("Final answer with what I have.")])
          : message([toolUse(`tu_${nth}`, "foreshadow_score", { ticker: "XYZ", eventDate: `2025-10-0${nth}` })], "tool_use"),
    });
    const result = await investigate({ question: "Dig in", tools, maxToolCalls: 2 }, { client });
    expect(scoreCalls).toHaveLength(2);
    expect(calls).toHaveLength(3);
    const last = calls[2].params as CreateParams;
    expect(last.tool_choice).toEqual({ type: "none" });
    // Earlier thinking blocks are signed against the system prompt, so it must not change; the note rides in the user turn.
    expect(calls.every((c) => JSON.stringify((c.params as CreateParams).system) === JSON.stringify(first(calls).system))).toBe(true);
    expect(last.messages).toHaveLength(5);
    const lastUser = last.messages[4].content as Array<{ type: string; text?: string }>;
    expect(lastUser.map((b) => b.type)).toEqual(["tool_result", "text"]);
    expect(lastUser[1].text).toMatch(/budget exhausted/i);
    expect(result.stopped).toBe("tool_cap");
    expect(result.answer).toBe("Final answer with what I have.");
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls.every((c) => c.ok && c.source === "foreshadow")).toBe(true);
  });

  it("refuses parallel calls beyond the budget and reports tool errors as is_error", async () => {
    const { tools, scoreCalls } = makeTools();
    const { client, calls } = fakeClient({
      create: (params) =>
        (params as CreateParams).tool_choice?.type === "none"
          ? message([text("done")])
          : message(
              [
                toolUse("tu_a", "foreshadow_history", { ticker: "XYZ" }),
                toolUse("tu_b", "foreshadow_score", { ticker: "XYZ", eventDate: "2025-10-14" }),
                toolUse("tu_c", "foreshadow_radar", {}),
              ],
              "tool_use",
            ),
    });
    const result = await investigate({ question: "Everything", tools, maxToolCalls: 2 }, { client });
    expect(scoreCalls).toHaveLength(1);
    expect(result.toolCalls.map((c) => [c.name, c.ok])).toEqual([
      ["foreshadow_history", false],
      ["foreshadow_score", true],
      ["foreshadow_radar", false],
    ]);
    expect(result.toolCalls[0].output).toContain("database offline");
    expect(result.toolCalls[2].output).toBe("tool budget exhausted");
    const second = calls[1].params as CreateParams;
    const blocks = second.messages[2].content as Array<Anthropic.ToolResultBlockParam | Anthropic.TextBlockParam>;
    const results = blocks.filter((b): b is Anthropic.ToolResultBlockParam => b.type === "tool_result");
    expect(results.map((r) => [r.tool_use_id, r.is_error])).toEqual([["tu_a", true], ["tu_b", false], ["tu_c", true]]);
    expect(blocks.at(-1)).toMatchObject({ type: "text", text: expect.stringMatching(/budget exhausted/i) });
    expect(result.stopped).toBe("tool_cap");
  });

  it("validates tool arguments before running the injected function", async () => {
    const { tools, scoreCalls } = makeTools();
    const { client } = fakeClient({
      create: (_params, nth) =>
        nth === 1 ? message([toolUse("tu_1", "foreshadow_score", { ticker: "XYZ" })], "tool_use") : message([text("ok")]),
    });
    const result = await investigate({ question: "?", tools }, { client });
    expect(scoreCalls).toHaveLength(0);
    expect(result.toolCalls[0].ok).toBe(false);
    expect(result.toolCalls[0].output).toContain("eventDate");
  });

  it("surfaces refusal and max_tokens stops, and prepends history", async () => {
    const { tools } = makeTools();
    const refused = fakeClient({ create: () => message([], "refusal") });
    const r1 = await investigate({ question: "?", tools, history: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }] }, { client: refused.client });
    expect(r1.stopped).toBe("refusal");
    expect((refused.calls[0].params as CreateParams).messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    const truncated = fakeClient({ create: () => message([text("partial")], "max_tokens") });
    const r2 = await investigate({ question: "?", tools }, { client: truncated.client });
    expect(r2).toMatchObject({ stopped: "max_tokens", answer: "partial" });
  });
});

function first(calls: Array<{ params: unknown }>): CreateParams {
  return calls[0].params as CreateParams;
}

describe("investigate (checking the answer's figures)", () => {
  it("asks once for a rewrite when a figure isn't in the tool results", async () => {
    const { tools } = makeTools();
    const { client, calls } = fakeClient({
      create: (_params, nth) =>
        nth === 1
          ? message([toolUse("tu_1", "foreshadow_score", { ticker: "XYZ", eventDate: "2025-10-14" })], "tool_use")
          : nth === 2
            ? message([text("XYZ scored 84.3, about 12 times its normal pace.")])
            : message([text("XYZ scored 84.3, leaning bearish.")]),
    });
    const result = await investigate({ question: "How did XYZ score?", tools }, { client, model: "claude-haiku-5-5" });
    expect(result.answer).toBe("XYZ scored 84.3, leaning bearish.");
    expect(calls).toHaveLength(3);
    const last = calls[2].params as CreateParams;
    expect(JSON.stringify(last.messages.at(-1))).toContain("don't appear in the tool results: 12");
    expect(last.tool_choice).toEqual({ type: "none" });
    expect(last.system).toEqual(first(calls).system);
  });

  it("keeps an answer whose figures all come from the results or the question", async () => {
    const { tools } = makeTools();
    const { client, calls } = fakeClient({
      create: (_params, nth) =>
        nth === 1
          ? message([toolUse("tu_1", "foreshadow_score", { ticker: "XYZ", eventDate: "2025-10-14" })], "tool_use")
          : message([text("XYZ scored 84.3 before its Oct 14 news.")]),
    });
    const result = await investigate(
      { question: "How did XYZ score?", context: { ticker: "XYZ", eventDate: "2025-10-14" }, tools },
      { client, model: "claude-haiku-5-5" },
    );
    expect(result.answer).toBe("XYZ scored 84.3 before its Oct 14 news.");
    expect(calls).toHaveLength(2);
  });
});

describe("investigate (with the Unusual Whales MCP server)", () => {
  it("uses the beta endpoint with the MCP connector and records server-side tool calls", async () => {
    const { tools, scoreCalls } = makeTools();
    const { client, calls } = fakeClient({
      betaCreate: (_params, nth) =>
        nth === 1
          ? message(
              [
                { type: "mcp_tool_use", id: "mcp_1", name: "flow_alerts", server_name: "unusual-whales", input: { ticker: "XYZ" } },
                { type: "mcp_tool_result", tool_use_id: "mcp_1", is_error: false, content: [{ type: "text", text: "[{\"premium\":4120000}]" }] },
                { type: "mcp_tool_use", id: "mcp_2", name: "greeks", server_name: "unusual-whales", input: { ticker: "XYZ" } },
                { type: "mcp_tool_result", tool_use_id: "mcp_2", is_error: true, content: "rate limited" },
                toolUse("tu_1", "foreshadow_score", { ticker: "XYZ", eventDate: "2025-10-14" }),
              ],
              "tool_use",
            )
          : message([text("Answer.\n\nEvidence:\n- flow_alerts: $4.1M")]),
    });
    const result = await investigate(
      { question: "What hit XYZ?", tools, uwMcp: { url: "https://mcp.unusualwhales.com/mcp", token: "uw-token" } },
      { client },
    );
    expect(calls.map((c) => c.method)).toEqual(["betaCreate", "betaCreate"]);
    const params = calls[0].params as BetaCreateParams;
    expect(params.betas).toEqual(["mcp-client-2025-11-20"]);
    expect(params.mcp_servers).toEqual([
      { type: "url", url: "https://mcp.unusualwhales.com/mcp", name: "unusual-whales", authorization_token: "uw-token" },
    ]);
    expect(params.tools?.[0]).toEqual({ type: "mcp_toolset", mcp_server_name: "unusual-whales" });
    expect(params.tools).toHaveLength(6);
    expect(params.tool_choice).toEqual({ type: "auto" });
    expect(scoreCalls).toHaveLength(1);
    expect(result.toolCalls).toEqual([
      { name: "flow_alerts", input: { ticker: "XYZ" }, output: "[{\"premium\":4120000}]", source: "uw-mcp", ok: true },
      { name: "greeks", input: { ticker: "XYZ" }, output: "rate limited", source: "uw-mcp", ok: false },
      expect.objectContaining({ name: "foreshadow_score", source: "foreshadow", ok: true }),
    ]);
    expect(result.stopped).toBe("end_turn");
    expect(result.answer).toContain("Answer.");
  });

  it("falls back to the Foreshadow tools when the UW MCP server can't be reached", async () => {
    const { tools } = makeTools();
    const mcpDown = Object.assign(Object.create(Anthropic.BadRequestError.prototype), {
      message: "400 mcp_servers[0] 'unusual-whales': Error while communicating with MCP server.",
      status: 400,
    });
    const { client, calls } = fakeClient({
      betaCreate: () => {
        throw mcpDown;
      },
      create: () => message([text("Answer without Unusual Whales.")]),
    });
    const result = await investigate(
      { question: "What hit XYZ?", tools, uwMcp: { url: "https://mcp.unusualwhales.com/mcp", token: "uw-token" } },
      { client, model: "claude-haiku-5-5" },
    );
    expect(calls.map((c) => c.method)).toEqual(["betaCreate", "create"]);
    expect(result.answer).toBe("Answer without Unusual Whales.");
  });
});

