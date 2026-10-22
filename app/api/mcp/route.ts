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
        inputSchema: z.object({
          ticker: z.string().min(1).max(12).describe("Ticker symbol"),
          eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Event date, YYYY-MM-DD"),
        }),
      },
      async ({ ticker, eventDate }) => json(await foreshadowSimilar({ ticker, eventDate })),
    );
  },
  {
    serverInfo: { name: "foreshadow", version: "0.2.0" },
  },
);

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export { handler as GET, handler as POST, handler as DELETE };
