/**
 * Public input/output shapes for the narrator package.
 *
 * These are deliberately narrow, serializable projections of the core types:
 * the app builds them from `ScoreResult` / `VerdictResult` and the narrator
 * never touches the database.
 */
import type { Direction, OptionType, Verdict } from "@foreshadow/core";
import type { NarratorClient } from "./client";

export type NarrationBand = "quiet" | "notable" | "someone-knew";

export interface NarrationSignal {
  key: string;
  label: string;
  weight: number;
  z: number;
  contribution: number;
  footprintValue: number;
  baselineMean: number;
  detail: Record<string, number>;
}

/** One of the largest trades, as Foreshadow stores it: no ids, timestamps or contract counts. */
export interface NarrationAlert {
  tradeDate: string;
  type: OptionType;
  strike: number;
  expiry: string;
  premium: number;
  isSweep: boolean;
}

export interface NarrationVerdict {
  verdict: Verdict;
  realizedMovePct: number | null;
  impliedMovePct: number | null;
  reactionWindow: "T" | "T+1";
  /**
   * The result in words, computed from verdict, lean and move:
   * "right", "right way, small move" or "wrong way" (absent when unknown).
   */
  outcome?: "right" | "right way, small move" | "wrong way" | "no clear side";
}

export interface NarrationFlags {
  insufficientHistory: boolean;
  multiCatalyst: boolean;
  partialWindow: boolean;
  isIndexOrEtf: boolean;
}

export interface NarrationInput {
  ticker: string;
  eventDate: string;
  eventTitle: string;
  kind: string;
  session: string;
  score: number;
  direction: Direction;
  band: NarrationBand;
  signals: NarrationSignal[];
  topAlerts: NarrationAlert[];
  verdict?: NarrationVerdict;
  flags: NarrationFlags;
}

export interface Narration {
  story: string;
  caption: string;
  model: string;
  numbersVerified: boolean;
  unverifiedNumbers: string[];
}

export interface TaggerRow {
  id: string;
  source: "potus" | "economic" | "news";
  text: string;
  date: string;
  time?: string;
}

export interface TaggedTicker {
  ticker: string;
  confidence: number;
  reason: string;
}

export interface TaggedRow {
  id: string;
  tickers: TaggedTicker[];
  sectors: string[];
  relevance: number;
}

export interface DossierEvent {
  eventDate: string;
  kind: string;
  title: string;
  score: number;
  direction: string;
  verdict: string;
  realizedMovePct: number | null;
  /** The site's three outcomes; when set, it decides "right" / "wrong" instead of the verdict. */
  outcome?: "right" | "right way, small move" | "wrong way" | "no clear side";
}

export interface DossierInput {
  ticker: string;
  events: DossierEvent[];
  hitRate: { scored: number; strong: number; matched: number };
}

export interface DossierSummary {
  summary: string;
  model: string;
}

/** Injected by the app; the narrator never touches the DB. */
export interface ForeshadowTools {
  foreshadow_score(args: { ticker: string; eventDate: string }): Promise<unknown>;
  foreshadow_radar(args: { daysAhead?: number; minScore?: number }): Promise<unknown>;
  foreshadow_history(args: { ticker: string }): Promise<unknown>;
  foreshadow_scorecard(args: Record<string, never>): Promise<unknown>;
  foreshadow_similar(args: { ticker: string; eventDate: string }): Promise<unknown>;
}

export interface InvestigateContext {
  ticker?: string;
  eventDate?: string;
  summary?: string;
}

export interface InvestigateInput {
  question: string;
  context?: InvestigateContext;
  tools: ForeshadowTools;
  uwMcp?: { url: string; token: string };
  /** Cap on Foreshadow tool executions. Default 6. */
  maxToolCalls?: number;
  history?: { role: "user" | "assistant"; content: string }[];
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  output: string;
  source: "foreshadow" | "uw-mcp";
  ok: boolean;
}

export type InvestigateStop = "end_turn" | "tool_cap" | "max_tokens" | "refusal";

export interface InvestigateResult {
  answer: string;
  toolCalls: ToolCallRecord[];
  model: string;
  stopped: InvestigateStop;
}

/** Options accepted by every public async function. */
export interface NarratorOptions {
  /** A real `Anthropic` instance or a structural stand-in (tests). */
  client?: NarratorClient;
  /** Overrides `NARRATOR_MODEL` / the default model id. */
  model?: string;
}
