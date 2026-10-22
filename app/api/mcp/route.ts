/**
 * Remote MCP server (streamable HTTP). Add `https://<host>/api/mcp` to Claude
 * or Cursor as one URL. Exposes the five Foreshadow tools over the scored
 * dataset; read-only, no auth required (the data is the public leaderboard).
 */

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { foreshadowHistory, foreshadowRadar, foreshadowScore, foreshadowScorecard, foreshadowSimilar } from "@/lib/tools/foreshadow";

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "foreshadow_score",
      {
        title: "Foreshadow score for an event",
        description:
          "Score (0-100), direction, verdict, the measurements behind the score, the count and total of flagged trades, and the five largest trades as examples, for a ticker's catalyst on or near a date. Scores measure how much informed options positioning appeared in the five trading days before the event, relative to the ticker's own 60-day baseline.",
        annotations: READ_ONLY,
        inputSchema: z.object({
          ticker: z.string().min(1).max(12).describe("Ticker symbol, e.g. VXRA"),
          eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Event date, YYYY-MM-DD"),
        }),
      },
      async ({ ticker, eventDate }) => json(await foreshadowScore({ ticker, eventDate })),
    );

    server.registerTool(
      "foreshadow_radar",
      {
        title: "Live Radar: upcoming catalysts ranked by partial footprint",
        description:
          "Upcoming catalysts in the next N trading days, each scored on the part of its footprint window that has already happened, ranked by score.",
        annotations: READ_ONLY,
        inputSchema: z.object({
          daysAhead: z.number().int().min(1).max(30).default(10).describe("Trading days ahead (default 10)"),
          minScore: z.number().min(0).max(100).optional().describe("Only return open windows with at least this score"),
        }),
      },
      async ({ daysAhead, minScore }) => json(await foreshadowRadar({ daysAhead, minScore })),
    );

    server.registerTool(
      "foreshadow_history",
      {
        title: "Ticker dossier: every scored catalyst and the hit rate",
        description:
          "All past and upcoming catalysts for a ticker with their scores and verdicts, plus how often a 70+ footprint matched the realized move.",
        annotations: READ_ONLY,
        inputSchema: z.object({
          ticker: z.string().min(1).max(12).describe("Ticker symbol"),
        }),
      },
      async ({ ticker }) => json(await foreshadowHistory({ ticker })),
    );

    server.registerTool(
      "foreshadow_scorecard",
      {
        title: "Scorecard: does unusual betting know something?",
        description:
          "Across every finished case: for each kind of news (FDA, earnings) and score band, how many cases, how often the bets were right, how often the stock moved more than options priced in, and how often it moved the way the bets leaned, with a one-line finding per kind. The 0-19 band (ordinary betting) is the yardstick.",
        annotations: READ_ONLY,
        inputSchema: z.object({}),
      },
      async () => json(await foreshadowScorecard()),
    );

    server.registerTool(
      "foreshadow_similar",
      {
        title: "Cases like this one",
        description:
          "Finished cases like one catalyst (same kind of news, similar score, same lean) and how often their bets were right, closest first. Answers 'has betting like this been right before?'.",
        annotations: READ_ONLY,
        inputSchema: z.object({
          ticker: z.string().min(1).max(12).describe("Ticker symbol"),
          eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Event date, YYYY-MM-DD"),
        }),
      },
      async ({ ticker, eventDate }) => json(await foreshadowSimilar({ ticker, eventDate })),
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
  },
  {
    serverInfo: { name: "foreshadow", version: "0.3.0" },
  },
);

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

function prompt(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export { handler as GET, handler as POST, handler as DELETE };
