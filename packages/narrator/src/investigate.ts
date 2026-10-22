/**
 * The Investigator: a manual tool loop over the three Foreshadow tools and,
 * when configured, the Unusual Whales hosted MCP server (beta MCP connector).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { getClient, getModel, type NarratorClient } from "./client";
import { toNarratorError } from "./errors";
import { INVESTIGATOR_SYSTEM_PROMPT, TOOL_BUDGET_EXHAUSTED_NOTE, buildInvestigatorUserMessage } from "./prompts";
import { FORESHADOW_TOOL_DEFINITIONS, runForeshadowTool } from "./tools";
import type { ForeshadowTools, InvestigateInput, InvestigateResult, InvestigateStop, NarratorOptions, ToolCallRecord } from "./types";

export const INVESTIGATE_MAX_TOKENS = 8192;
export const DEFAULT_MAX_TOOL_CALLS = 6;
export const UW_MCP_SERVER_NAME = "unusual-whales";
const MCP_BETA = "mcp-client-2025-11-20";

type AnyBlock = Anthropic.ContentBlock | Anthropic.Beta.BetaContentBlock;
type TurnLike = { content: ReadonlyArray<AnyBlock>; stop_reason: string | null };
/** `tool_result` with string content only: valid for both the beta and the non-beta request shapes. */
type ToolResultParam = Pick<Anthropic.ToolResultBlockParam, "type" | "tool_use_id" | "is_error"> & { content: string };

interface Session<T extends TurnLike> {
  /** `final` adds the budget-exhausted note and forbids further tool use. */
  send(final: boolean): Promise<T>;
  append(turn: T, results: ToolResultParam[]): void;
}

function systemBlocks<T extends Anthropic.TextBlockParam>(final: boolean): T[] {
  const blocks = [{ type: "text", text: INVESTIGATOR_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }] as T[];
  if (final) blocks.push({ type: "text", text: TOOL_BUDGET_EXHAUSTED_NOTE } as T);
  return blocks;
}

function toolChoice(final: boolean): Anthropic.ToolChoice {
  return final ? { type: "none" } : { type: "auto" };
}

function plainSession(client: NarratorClient, model: string, messages: Anthropic.MessageParam[]): Session<Anthropic.Message> {
  return {
    send: (final) =>
      client.messages.create({
        model,
        max_tokens: INVESTIGATE_MAX_TOKENS,
        system: systemBlocks<Anthropic.TextBlockParam>(final),
        tools: [...FORESHADOW_TOOL_DEFINITIONS],
        tool_choice: toolChoice(final),
        output_config: { effort: "medium" },
        messages,
      }),
    append: (turn, results) => {
      messages.push({ role: "assistant", content: turn.content });
      if (results.length > 0) messages.push({ role: "user", content: results });
    },
  };
}

function mcpSession(
  client: NarratorClient,
  model: string,
  messages: Anthropic.Beta.BetaMessageParam[],
  uwMcp: { url: string; token: string },
): Session<Anthropic.Beta.BetaMessage> {
  return {
    send: (final) =>
      client.beta.messages.create({
        model,
        max_tokens: INVESTIGATE_MAX_TOKENS,
        betas: [MCP_BETA],
        system: systemBlocks<Anthropic.Beta.BetaTextBlockParam>(final),
        mcp_servers: [{ type: "url", url: uwMcp.url, name: UW_MCP_SERVER_NAME, authorization_token: uwMcp.token }],
        tools: [{ type: "mcp_toolset", mcp_server_name: UW_MCP_SERVER_NAME }, ...FORESHADOW_TOOL_DEFINITIONS],
        tool_choice: toolChoice(final),
        output_config: { effort: "medium" },
        messages,
      }),
    append: (turn, results) => {
      messages.push({ role: "assistant", content: turn.content });
      if (results.length > 0) messages.push({ role: "user", content: results });
    },
  };
}

function textOf(content: ReadonlyArray<AnyBlock>): string {
  return content
    .filter((b): b is Anthropic.TextBlock | Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** Server-executed MCP calls arrive as paired `mcp_tool_use` / `mcp_tool_result` blocks. */
function recordMcpCalls(content: ReadonlyArray<AnyBlock>, toolCalls: ToolCallRecord[]): void {
  const pending = new Map<string, ToolCallRecord>();
  for (const block of content) {
    if (block.type === "mcp_tool_use") {
      const record: ToolCallRecord = { name: block.name, input: block.input, output: "", source: "uw-mcp", ok: true };
      pending.set(block.id, record);
      toolCalls.push(record);
    } else if (block.type === "mcp_tool_result") {
      const record = pending.get(block.tool_use_id);
      if (!record) continue;
      record.output = typeof block.content === "string" ? block.content : block.content.map((b) => b.text).join("\n");
      record.ok = !block.is_error;
    }
  }
}

function finish(turn: TurnLike, model: string, toolCalls: ToolCallRecord[], stopped: InvestigateStop): InvestigateResult {
  const reason = turn.stop_reason;
  const effective: InvestigateStop = reason === "refusal" || reason === "max_tokens" ? reason : stopped;
  return { answer: textOf(turn.content), toolCalls, model, stopped: effective };
}

async function runLoop<T extends TurnLike>(
  session: Session<T>,
  tools: ForeshadowTools,
  maxToolCalls: number,
  model: string,
): Promise<InvestigateResult> {
  const toolCalls: ToolCallRecord[] = [];
  let executed = 0;
  for (;;) {
    const turn = await session.send(false);
    recordMcpCalls(turn.content, toolCalls);
    if (turn.stop_reason === "refusal" || turn.stop_reason === "max_tokens") return finish(turn, model, toolCalls, "end_turn");
    if (turn.stop_reason === "pause_turn") {
      session.append(turn, []);
      continue;
    }
    const uses = turn.content.filter((b): b is Anthropic.ToolUseBlock | Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (turn.stop_reason !== "tool_use" || uses.length === 0) return finish(turn, model, toolCalls, "end_turn");

    const results: ToolResultParam[] = [];
    for (const use of uses) {
      if (executed >= maxToolCalls) {
        toolCalls.push({ name: use.name, input: use.input, output: "tool budget exhausted", source: "foreshadow", ok: false });
        results.push({ type: "tool_result", tool_use_id: use.id, content: "tool budget exhausted", is_error: true });
        continue;
      }
      executed += 1;
      const record = await runForeshadowTool(use.name, use.input, tools);
      toolCalls.push(record);
      results.push({ type: "tool_result", tool_use_id: use.id, content: record.output, is_error: !record.ok });
    }
    session.append(turn, results);

    if (executed >= maxToolCalls) {
      const last = await session.send(true);
      recordMcpCalls(last.content, toolCalls);
      return finish(last, model, toolCalls, "tool_cap");
    }
  }
}

/**
 * Answer a user question with the Foreshadow tools (and the UW MCP server when
 * configured). Foreshadow tool executions are capped at `maxToolCalls`; MCP
 * tools run server-side and are recorded but not capped.
 */
export async function investigate(input: InvestigateInput, opts: NarratorOptions = {}): Promise<InvestigateResult> {
  const client = getClient(opts.client);
  const model = opts.model ?? getModel();
  const maxToolCalls = Math.max(0, input.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS);
  const history = (input.history ?? []).map((m) => ({ role: m.role, content: m.content }));
  const question = { role: "user" as const, content: buildInvestigatorUserMessage(input.question, input.context) };

  try {
    if (input.uwMcp) {
      const messages: Anthropic.Beta.BetaMessageParam[] = [...history, question];
      return await runLoop(mcpSession(client, model, messages, input.uwMcp), input.tools, maxToolCalls, model);
    }
    const messages: Anthropic.MessageParam[] = [...history, question];
    return await runLoop(plainSession(client, model, messages), input.tools, maxToolCalls, model);
  } catch (err) {
    throw toNarratorError(err, "investigate");
  }
}
