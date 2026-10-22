import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClient, getModel, type NarratorClient } from "./client";
import { NarratorError, toNarratorError } from "./errors";
import { TAGGER_SYSTEM_PROMPT, buildTaggerUserMessage } from "./prompts";
import { TaggerOutputSchema, type TaggerOutput } from "./schemas";
import type { NarratorOptions, TaggedRow, TaggerRow } from "./types";

export const TAGGER_CHUNK_SIZE = 40;
export const TAGGER_MAX_TOKENS = 2048;

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,7}$/;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function normalizeRow(id: string, raw: TaggerOutput["rows"][number] | undefined): TaggedRow {
  if (!raw) return { id, tickers: [], sectors: [], relevance: 0 };
  const seen = new Set<string>();
  const tickers = raw.tickers
    .map((t) => ({ ticker: t.ticker.trim().toUpperCase(), confidence: clamp01(t.confidence), reason: t.reason.trim() }))
    .filter((t) => TICKER_RE.test(t.ticker) && !seen.has(t.ticker) && seen.add(t.ticker))
    .sort((a, b) => b.confidence - a.confidence);
  return { id, tickers, sectors: [...new Set(raw.sectors)], relevance: clamp01(raw.relevance) };
}

async function tagChunk(client: NarratorClient, model: string, rows: TaggerRow[]): Promise<TaggedRow[]> {
  let parsed: TaggerOutput | null;
  try {
    const response = await client.messages.parse({
      model,
      max_tokens: TAGGER_MAX_TOKENS,
      system: [{ type: "text", text: TAGGER_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildTaggerUserMessage(rows) }],
      output_config: { effort: "low", format: zodOutputFormat(TaggerOutputSchema) },
    });
    if (response.stop_reason === "refusal") throw new NarratorError("tagCatalysts: Claude declined to tag these rows");
    parsed = response.parsed_output;
  } catch (err) {
    // Truncated or malformed output (not an HTTP error) on a multi-row chunk: halve and retry.
    if (err instanceof Anthropic.AnthropicError && !(err instanceof Anthropic.APIError) && rows.length > 1) {
      const mid = Math.ceil(rows.length / 2);
      const halves = await Promise.all([
        tagChunk(client, model, rows.slice(0, mid)),
        tagChunk(client, model, rows.slice(mid)),
      ]);
      return halves.flat();
    }
    throw toNarratorError(err, "tagCatalysts");
  }
  if (!parsed) throw new NarratorError("tagCatalysts: no structured output");
  const byId = new Map(parsed.rows.map((r) => [r.id, r]));
  return rows.map((row) => normalizeRow(row.id, byId.get(row.id)));
}

/**
 * Turn non-ticker calendar rows into affected tickers/sectors. One request per
 * 40 rows; chunks run concurrently and results keep the input order.
 */
export async function tagCatalysts(rows: TaggerRow[], opts: NarratorOptions = {}): Promise<TaggedRow[]> {
  if (rows.length === 0) return [];
  const client = getClient(opts.client);
  const model = opts.model ?? getModel();
  const chunks: TaggerRow[][] = [];
  for (let i = 0; i < rows.length; i += TAGGER_CHUNK_SIZE) chunks.push(rows.slice(i, i + TAGGER_CHUNK_SIZE));
  const tagged = await Promise.all(chunks.map((chunk) => tagChunk(client, model, chunk)));
  return tagged.flat();
}
