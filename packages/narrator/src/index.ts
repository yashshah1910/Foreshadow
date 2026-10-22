export { DEFAULT_MODEL, getClient, getModel, isNarratorConfigured, resetClientCache } from "./client";
export type { NarratorClient } from "./client";
export { NarratorError, NarratorUnavailableError } from "./errors";
export { NARRATION_MAX_TOKENS, NARRATION_VERSION, narrateEvent, narrationCacheKey } from "./narrator";
export { CAPTION_MAX_LENGTH, fallbackDossierSummary, fallbackNarration, formatMoney, formatPct } from "./fallback";
export { TAGGER_CHUNK_SIZE, TAGGER_MAX_TOKENS, tagCatalysts } from "./tagger";
export { DOSSIER_MAX_TOKENS, summarizeDossier } from "./dossier";
export { FORESHADOW_TOOL_DEFINITIONS, FORESHADOW_TOOL_NAMES, runForeshadowTool } from "./tools";
export { INVESTIGATE_MAX_TOKENS, DEFAULT_MAX_TOOL_CALLS, UW_MCP_SERVER_NAME, investigate } from "./investigate";
export { OFF_TOPIC_REPLY } from "./prompts";
export { SECTORS, SectorSchema, NarrationOutputSchema, TaggerOutputSchema, TaggedRowSchema, DossierOutputSchema } from "./schemas";
export type { Sector } from "./schemas";
export {
  INVESTIGATOR_SYSTEM_PROMPT,
  NARRATOR_SYSTEM_PROMPT,
  TAGGER_SYSTEM_PROMPT,
  DOSSIER_SYSTEM_PROMPT,
  TOOL_BUDGET_EXHAUSTED_NOTE,
} from "./prompts";
export { buildHaystack, extractNumbers, tokenMatches, verifyNumbers } from "./verify";
export type { Haystack, NumericToken, NumericTokenKind, VerificationResult } from "./verify";
export type {
  DossierEvent,
  DossierInput,
  DossierSummary,
  ForeshadowTools,
  InvestigateContext,
  InvestigateInput,
  InvestigateResult,
  InvestigateStop,
  Narration,
  NarrationAlert,
  NarrationBand,
  NarrationFlags,
  NarrationInput,
  NarrationSignal,
  NarrationVerdict,
  NarratorOptions,
  TaggedRow,
  TaggedTicker,
  TaggerRow,
  ToolCallRecord,
} from "./types";
