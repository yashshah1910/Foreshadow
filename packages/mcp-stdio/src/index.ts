#!/usr/bin/env node
/**
 * foreshadow-mcp: a stdio MCP server for clients that cannot speak
 * streamable HTTP. It proxies the five tools to a Foreshadow deployment's
 * REST endpoints.
 *
 *   FORESHADOW_URL=https://foreshadow-six.vercel.app npx foreshadow-mcp
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

const server = new McpServer({ name: "foreshadow", version: "0.2.0" });

server.registerTool(
  "foreshadow_score",
  {
    title: "Foreshadow score for an event",
    description: "Score (0-100), direction, verdict, measurements, trade totals and the five largest trades as examples, for a ticker's catalyst on or near a date.",
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
    inputSchema: z.object({ ticker: z.string().min(1).max(12) }),
  },
  async ({ ticker }) => ({ content: [{ type: "text", text: await get("/api/history", { ticker }) }] }),
);

server.registerTool(
  "foreshadow_scorecard",
  {
    title: "Scorecard",
    description: "How often unusual betting was right, by kind of news and score band, against ordinary betting.",
    inputSchema: z.object({}),
  },
  async () => ({ content: [{ type: "text", text: await get("/api/scorecard", {}) }] }),
);

server.registerTool(
  "foreshadow_similar",
  {
    title: "Cases like this one",
    description: "Finished cases like one catalyst and how often their bets were right.",
    inputSchema: z.object({ ticker: z.string().min(1).max(12), eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  },
  async ({ ticker, eventDate }) => ({ content: [{ type: "text", text: await get("/api/similar", { ticker, eventDate }) }] }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
