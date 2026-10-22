import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClient, getModel, type NarratorClient } from "./client";
import { NarratorError, toNarratorError } from "./errors";
import { NARRATOR_SYSTEM_PROMPT, buildNarrationRetryMessage, buildNarrationUserMessage } from "./prompts";
import { NarrationOutputSchema, type NarrationOutput } from "./schemas";
import type { Narration, NarrationInput, NarratorOptions } from "./types";
import { verifyNumbers } from "./verify";

export const NARRATION_MAX_TOKENS = 2048;

/** `${ticker}:${eventDate}:${score}` — stable per scored event, so the app can cache stories. */
export function narrationCacheKey(input: Pick<NarrationInput, "ticker" | "eventDate" | "score">): string {
  return `${input.ticker}:${input.eventDate}:${input.score}`;
}

async function requestNarration(
  client: NarratorClient,
  model: string,
  messages: Anthropic.MessageParam[],
): Promise<NarrationOutput> {
  const response = await client.messages
    .parse({
      model,
      max_tokens: NARRATION_MAX_TOKENS,
      system: [{ type: "text", text: NARRATOR_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages,
      output_config: { effort: "low", format: zodOutputFormat(NarrationOutputSchema) },
    })
    .catch((err: unknown) => {
      throw toNarratorError(err, "narrateEvent");
    });
  if (response.stop_reason === "refusal") {
    throw new NarratorError("narrateEvent: Claude declined to write this story");
  }
  if (!response.parsed_output) {
    throw new NarratorError(`narrateEvent: no structured output (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

/**
 * Three-sentence story plus caption for an Event Card. Every figure in the
 * text is checked against the input; one corrective retry is made before
 * returning `numbersVerified: false` (the app then shows `fallbackNarration`).
 */
export async function narrateEvent(input: NarrationInput, opts: NarratorOptions = {}): Promise<Narration> {
  const client = getClient(opts.client);
  const model = opts.model ?? getModel();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildNarrationUserMessage(input) }];

  let output = await requestNarration(client, model, messages);
  let check = verifyNumbers(`${output.story}\n${output.caption}`, input);
  if (!check.numbersVerified) {
    messages.push(
      { role: "assistant", content: JSON.stringify(output) },
      { role: "user", content: buildNarrationRetryMessage(check.unverifiedNumbers) },
    );
    output = await requestNarration(client, model, messages);
    check = verifyNumbers(`${output.story}\n${output.caption}`, input);
  }

  return {
    story: output.story.trim(),
    caption: output.caption.trim(),
    model,
    numbersVerified: check.numbersVerified,
    unverifiedNumbers: check.unverifiedNumbers,
  };
}
