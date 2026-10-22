import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClient, getModel } from "./client";
import { NarratorError, toNarratorError } from "./errors";
import { DOSSIER_SYSTEM_PROMPT, buildDossierUserMessage } from "./prompts";
import { DossierOutputSchema } from "./schemas";
import type { DossierInput, DossierSummary, NarratorOptions } from "./types";

export const DOSSIER_MAX_TOKENS = 2048;

/** One paragraph on whether the ticker is a repeat offender. */
export async function summarizeDossier(input: DossierInput, opts: NarratorOptions = {}): Promise<DossierSummary> {
  const client = getClient(opts.client);
  const model = opts.model ?? getModel();
  const response = await client.messages
    .parse({
      model,
      max_tokens: DOSSIER_MAX_TOKENS,
      system: [{ type: "text", text: DOSSIER_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildDossierUserMessage(input) }],
      output_config: { effort: "low", format: zodOutputFormat(DossierOutputSchema) },
    })
    .catch((err: unknown) => {
      throw toNarratorError(err, "summarizeDossier");
    });
  if (response.stop_reason === "refusal") {
    throw new NarratorError("summarizeDossier: Claude declined to summarize this dossier");
  }
  if (!response.parsed_output) {
    throw new NarratorError(`summarizeDossier: no structured output (stop_reason: ${response.stop_reason})`);
  }
  return { summary: response.parsed_output.summary.trim(), model };
}
