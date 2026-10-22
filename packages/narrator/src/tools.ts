/**
 * The Foreshadow tools as JSON-schema tool definitions (strict, closed
 * objects) plus the dispatcher that runs the app-injected implementations.
 * The MCP server reuses `FORESHADOW_TOOL_DEFINITIONS` for its own listing.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { HistoryArgsSchema, RadarArgsSchema, ScoreArgsSchema, ScorecardArgsSchema, SimilarArgsSchema } from "./schemas";
import type { ForeshadowTools, ToolCallRecord } from "./types";

export const FORESHADOW_TOOL_DEFINITIONS: readonly Anthropic.Tool[] = [
  {
    name: "foreshadow_score",
    description:
      "Foreshadow score (0-100), direction, band, signal breakdown, trade count and total, the five largest trades and verdict for one catalyst, identified by ticker and event date (YYYY-MM-DD). Use for any question about a specific event or its score.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Uppercase US-listed symbol, e.g. XYZ" },
        eventDate: { type: "string", description: "Catalyst date, YYYY-MM-DD" },
      },
      required: ["ticker", "eventDate"],
      additionalProperties: false,
    },
  },
  {
    name: "foreshadow_radar",
    description:
      "Upcoming catalysts with their live Foreshadow scores, highest first. Use for 'what is lighting up' questions. Both arguments are optional.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        daysAhead: { type: "integer", description: "How many calendar days ahead to include (default 10)" },
        minScore: { type: "number", description: "Only return catalysts scoring at least this (0-100)" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "foreshadow_history",
    description:
      "Every scored catalyst for a ticker with score, direction, verdict and realized move, plus the ticker's hit rate. Use for repeat-offender and track-record questions.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Uppercase US-listed symbol" },
      },
      required: ["ticker"],
      additionalProperties: false,
    },
  },
  {
    name: "foreshadow_scorecard",
    description:
      "Foreshadow's public scorecard over every finished case: for each kind of news (FDA, earnings) and score band (0-19, 20-39, 40-69, 70+), how many cases, how often the bets were right, how often the stock moved more than expected, and how often it moved the way the bets leaned, plus a one-line finding per kind. Use for 'does unusual betting actually predict anything' questions.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "foreshadow_similar",
    description:
      "Finished cases like one case (same kind of news, similar score, same lean) and how often their bets were right, closest first. Use for 'has betting like this been right before' or 'what happened in similar cases'.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Uppercase US-listed symbol, e.g. XYZ" },
        eventDate: { type: "string", description: "Catalyst date, YYYY-MM-DD" },
      },
      required: ["ticker", "eventDate"],
      additionalProperties: false,
    },
  },
];

export const FORESHADOW_TOOL_NAMES: readonly string[] = FORESHADOW_TOOL_DEFINITIONS.map((t) => t.name);

function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

async function dispatch(name: string, input: unknown, tools: ForeshadowTools): Promise<unknown> {
  switch (name) {
    case "foreshadow_score":
      return tools.foreshadow_score(ScoreArgsSchema.parse(input));
    case "foreshadow_radar":
      return tools.foreshadow_radar(RadarArgsSchema.parse(input));
    case "foreshadow_history":
      return tools.foreshadow_history(HistoryArgsSchema.parse(input));
    case "foreshadow_scorecard":
      return tools.foreshadow_scorecard(ScorecardArgsSchema.parse(input ?? {}) as Record<string, never>);
    case "foreshadow_similar":
      return tools.foreshadow_similar(SimilarArgsSchema.parse(input));
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

/** Run one Foreshadow tool call; errors become `ok: false` records, never throws. */
export async function runForeshadowTool(name: string, input: unknown, tools: ForeshadowTools): Promise<ToolCallRecord> {
  try {
    const result = await dispatch(name, input, tools);
    return { name, input, output: JSON.stringify(result ?? null), source: "foreshadow", ok: true };
  } catch (err) {
    return { name, input, output: describeError(err), source: "foreshadow", ok: false };
  }
}
