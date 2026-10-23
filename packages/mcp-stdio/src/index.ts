#!/usr/bin/env node
/**
 * foreshadow-mcp: a stdio MCP server for clients that cannot speak
 * streamable HTTP. It proxies the five tools to a Foreshadow deployment's
 * REST endpoints, and offers the same three prompts as /api/mcp.
 *
 *   pnpm --filter foreshadow-mcp build
 *   FORESHADOW_URL=https://foreshadow-six.vercel.app node packages/mcp-stdio/dist/index.js
 */

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

const BASE = (process.env.FORESHADOW_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function get(path: string, params: Record<string, string | number | undefined>) {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} from ${url.pathname}: ${text.slice(0, 300)}`);
  return text;
}

const server = new McpServer({ name: "foreshadow", version: "0.3.0" });
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

function prompt(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

server.registerTool(
  "foreshadow_score",
  {
    title: "Foreshadow score for an event",
    description: "Score (0-100), rank among finished cases of the same kind, direction, money on each side, verdict, measurements, trade totals and the five largest trades as examples, for a ticker's catalyst on or near a date.",
    annotations: READ_ONLY,
    inputSchema: z.object({
      ticker: z.string().min(1).max(12),
      eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  },
  async ({ ticker, eventDate }) => ({ content: [{ type: "text", text: await get("/api/score", { ticker, eventDate }) }] }),
);

server.registerTool(
  "foreshadow_radar",
  {
    title: "Live Radar",
    description: "Upcoming catalysts ranked by the footprint forming in their partial window.",
    annotations: READ_ONLY,
    inputSchema: z.object({
      daysAhead: z.number().int().min(1).max(30).default(10),
      minScore: z.number().min(0).max(100).optional(),
    }),
  },
  async ({ daysAhead, minScore }) => ({ content: [{ type: "text", text: await get("/api/radar", { daysAhead, minScore }) }] }),
);

server.registerTool(
  "foreshadow_history",
  {
    title: "Ticker dossier",
    description: "Every scored catalyst for a ticker and its hit rate.",
    annotations: READ_ONLY,
    inputSchema: z.object({ ticker: z.string().min(1).max(12) }),
  },
  async ({ ticker }) => ({ content: [{ type: "text", text: await get("/api/history", { ticker }) }] }),
);

server.registerTool(
  "foreshadow_scorecard",
  {
    title: "Scorecard",
    description: "How often unusual betting was right, by kind of news and score band, against ordinary betting.",
    annotations: READ_ONLY,
    inputSchema: z.object({}),
  },
  async () => ({ content: [{ type: "text", text: await get("/api/scorecard", {}) }] }),
);

server.registerTool(
  "foreshadow_similar",
  {
    title: "Cases like this one",
    description: "Finished cases like one catalyst and how often their bets were right.",
    annotations: READ_ONLY,
    inputSchema: z.object({ ticker: z.string().min(1).max(12), eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  },
  async ({ ticker, eventDate }) => ({ content: [{ type: "text", text: await get("/api/similar", { ticker, eventDate }) }] }),
);

// Ready-made prompts: they show up as slash commands in Claude and chain the tools above.
server.registerPrompt(
  "investigate_case",
  {
    title: "Investigate a case",
    description: "Was the options betting before this news unusual, which way did it lean, and has betting like it been right before?",
    argsSchema: z.object({
      ticker: z.string().describe("Ticker symbol, e.g. TSLA"),
      eventDate: z.string().describe("Date of the news, YYYY-MM-DD"),
    }),
  },
  ({ ticker, eventDate }) =>
    prompt(
      `Use foreshadow_score for ${ticker.toUpperCase()} on ${eventDate}, then foreshadow_similar for the same case. In under 150 words and plain English (no trading jargon): how unusual the betting was before the news and which way it leaned, the biggest bet, what the stock then did against what options expected, and how often similar betting was right. Say clearly that this is a statistical pattern, not proof anyone knew anything.`,
    ),
);

server.registerPrompt(
  "week_ahead",
  {
    title: "Unusual betting ahead of this week's news",
    description: "The upcoming news with the most unusual options betting so far, and how much that kind of signal has meant in the past.",
  },
  () =>
    prompt(
      "Use foreshadow_radar (daysAhead 10) and foreshadow_scorecard. List the five upcoming events with the highest scores so far: ticker, the news and its date, the score and which way the betting leans. Then say in two sentences how often unusual betting before that kind of news has been right, using the scorecard's finding. Plain English, no trading jargon, not advice.",
    ),
);

server.registerPrompt(
  "stock_track_record",
  {
    title: "A stock's track record",
    description: "Does unusual betting keep showing up before this stock's news, and was it right?",
    argsSchema: z.object({ ticker: z.string().describe("Ticker symbol, e.g. NVDA") }),
  },
  ({ ticker }) =>
    prompt(
      `Use foreshadow_history for ${ticker.toUpperCase()}. In under 120 words and plain English: how many of its news events Foreshadow has scored, how often the betting before them was unusual (40+), how often those bets were right, and the single most striking case with its date. Not advice.`,
    ),
);

const transport = new StdioServerTransport();
await server.connect(transport);
