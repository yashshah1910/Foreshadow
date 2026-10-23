/**
 * The Investigator: a manual tool loop over the three Foreshadow tools and,
 * when configured, the Unusual Whales hosted MCP server (beta MCP connector).
 */
import Anthropic from "@anthropic-ai/sdk";
import { getClient, getModel, type NarratorClient } from "./client";
import { toNarratorError } from "./errors";
import { INVESTIGATOR_SYSTEM_PROMPT, TOOL_BUDGET_EXHAUSTED_NOTE, buildInvestigatorUserMessage } from "./prompts";
import { FORESHADOW_TOOL_DEFINITIONS, runForeshadowTool } from "./tools";
import type { ForeshadowTools, InvestigateInput, InvestigateResult, InvestigateStop, NarratorOptions, ToolCallRecord } from "./types";
import { verifyNumbers } from "./verify";

export const INVESTIGATE_MAX_TOKENS = 8192;
export const DEFAULT_MAX_TOOL_CALLS = 6;
export const UW_MCP_SERVER_NAME = "unusual-whales";
const MCP_BETA = "mcp-client-2025-11-20";

type AnyBlock = Anthropic.ContentBlock | Anthropic.Beta.BetaContentBlock;
type TurnLike = { content: ReadonlyArray<AnyBlock>; stop_reason: string | null };
/** `tool_result` with string content only: valid for both the beta and the non-beta request shapes. */
type ToolResultParam = Pick<Anthropic.ToolResultBlockParam, "type" | "tool_use_id" | "is_error"> & { content: string };

interface Session<T extends TurnLike> {
  /** `final` forbids further tool use. The system prompt never changes between turns: earlier thinking blocks are signed against it. */
  send(final: boolean): Promise<T>;
  /** `note` rides in the same user turn as the tool results (after them). */
  append(turn: T, results: ToolResultParam[], note?: string): void;
  /** Adds a plain user message (used to ask for a corrected answer). */
  say(text: string): void;
}

function systemBlocks<T extends Anthropic.TextBlockParam>(): T[] {
  return [{ type: "text", text: INVESTIGATOR_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }] as T[];
}

function userTurn(results: ToolResultParam[], note?: string): Array<ToolResultParam | Anthropic.TextBlockParam> {
  return note ? [...results, { type: "text", text: note }] : results;
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
        system: systemBlocks<Anthropic.TextBlockParam>(),
        tools: [...FORESHADOW_TOOL_DEFINITIONS],
        tool_choice: toolChoice(final),
        output_config: { effort: "low" },
        messages,
      }),
    append: (turn, results, note) => {
      messages.push({ role: "assistant", content: turn.content });
      if (results.length > 0 || note) messages.push({ role: "user", content: userTurn(results, note) });
    },
    say: (text) => {
      messages.push({ role: "user", content: text });
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
        system: systemBlocks<Anthropic.Beta.BetaTextBlockParam>(),
        mcp_servers: [{ type: "url", url: uwMcp.url, name: UW_MCP_SERVER_NAME, authorization_token: uwMcp.token }],
        tools: [{ type: "mcp_toolset", mcp_server_name: UW_MCP_SERVER_NAME }, ...FORESHADOW_TOOL_DEFINITIONS],
        tool_choice: toolChoice(final),
        output_config: { effort: "low" },
        messages,
      }),
    append: (turn, results, note) => {
      messages.push({ role: "assistant", content: turn.content });
      if (results.length > 0 || note) messages.push({ role: "user", content: userTurn(results, note) });
    },
    say: (text) => {
      messages.push({ role: "user", content: text });
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

/**
 * Every figure in an answer has to come from a tool result or the question, as
 * with the case stories. If some don't, ask once for a rewrite that uses only
 * figures from the results.
 */
async function checkedFinish<T extends TurnLike>(
  session: Session<T>,
  turn: T,
  model: string,
  toolCalls: ToolCallRecord[],
  known: string,
): Promise<InvestigateResult> {
  const result = finish(turn, model, toolCalls, "end_turn");
  if (toolCalls.length === 0) return result;
  const hay = [known, ...toolCalls.map((t) => t.output)];
  const check = verifyNumbers(result.answer, hay);
  if (check.numbersVerified) return result;
  session.append(turn, []);
  session.say(
    `These figures in your answer don't appear in the tool results: ${check.unverifiedNumbers.join(", ")}. Rewrite the answer using only figures that appear in the tool results (rounding is fine), in the same format.`,
  );
  const fixed = await session.send(true);
  const retry = finish(fixed, model, toolCalls, "end_turn");
  return retry.answer ? retry : result;
}

async function runLoop<T extends TurnLike>(
  session: Session<T>,
  tools: ForeshadowTools,
  maxToolCalls: number,
  model: string,
  known: string,
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
    if (turn.stop_reason !== "tool_use" || uses.length === 0) return checkedFinish(session, turn, model, toolCalls, known);

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
    const capped = executed >= maxToolCalls;
    session.append(turn, results, capped ? TOOL_BUDGET_EXHAUSTED_NOTE : undefined);

    if (capped) {
      const last = await session.send(true);
      recordMcpCalls(last.content, toolCalls);
      return finish(last, model, toolCalls, "tool_cap");
    }
  }
}

function isMcpConnectionError(err: unknown): boolean {
  return err instanceof Anthropic.BadRequestError && /mcp_servers/i.test(err.message);
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
  // Figures the reader supplied (the question, the page summary, earlier turns) count as known too.
  const known = [question.content, ...history.map((m) => m.content)].join("\n");

  try {
    if (input.uwMcp) {
      try {
        const messages: Anthropic.Beta.BetaMessageParam[] = [...history, question];
        return await runLoop(mcpSession(client, model, messages, input.uwMcp), input.tools, maxToolCalls, model, known);
      } catch (err) {
        // The hosted UW MCP server is sometimes unreachable; answer with the Foreshadow tools instead.
        if (!isMcpConnectionError(err)) throw err;
      }
    }
    const messages: Anthropic.MessageParam[] = [...history, question];
    return await runLoop(plainSession(client, model, messages), input.tools, maxToolCalls, model, known);
  } catch (err) {
    throw toNarratorError(err, "investigate");
  }
}
