import { z } from "zod";

/** Fixed sector vocabulary for the catalyst tagger. */
export const SECTORS = [
  "Technology",
  "Healthcare",
  "Financials",
  "Energy",
  "Industrials",
  "Consumer",
  "Materials",
  "Utilities",
  "Real Estate",
  "Communication",
  "Defense",
  "Crypto",
  "Macro",
] as const;

export type Sector = (typeof SECTORS)[number];

export const SectorSchema = z.enum(SECTORS);

/* ---------- Structured output contracts (passed to zodOutputFormat) ---------- */

export const NarrationOutputSchema = z.object({
  story: z.string().describe("Exactly three sentences of plain English."),
  caption: z
    .string()
    .describe("One tweet-ready line of at most 200 characters. No hashtags, no emoji, no links."),
});
export type NarrationOutput = z.infer<typeof NarrationOutputSchema>;

export const TaggedTickerSchema = z.object({
  ticker: z.string().describe("A real US-listed symbol in UPPERCASE."),
  confidence: z.number().describe("0 to 1."),
  reason: z.string().describe("One clause explaining the link."),
});

export const TaggedRowSchema = z.object({
  id: z.string().describe("The input row id, unchanged."),
  tickers: z.array(TaggedTickerSchema),
  sectors: z.array(SectorSchema),
  relevance: z.number().describe("0 to 1: how likely the row is to move markets at all."),
});

export const TaggerOutputSchema = z.object({
  rows: z.array(TaggedRowSchema),
});
export type TaggerOutput = z.infer<typeof TaggerOutputSchema>;

export const DossierOutputSchema = z.object({
  summary: z.string().describe("One paragraph, three to five sentences."),
});
export type DossierOutput = z.infer<typeof DossierOutputSchema>;

/* ---------- Tool-argument validation for the investigator ---------- */

export const ScoreArgsSchema = z.object({ ticker: z.string(), eventDate: z.string() });
export const RadarArgsSchema = z.object({
  daysAhead: z.number().optional(),
  minScore: z.number().optional(),
});
export const HistoryArgsSchema = z.object({ ticker: z.string() });
