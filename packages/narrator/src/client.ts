import Anthropic from "@anthropic-ai/sdk";
import { NarratorUnavailableError } from "./errors";

/** Exact model id; no date suffix. Override with `NARRATOR_MODEL` or the `model` option. */
export const DEFAULT_MODEL = "claude-opus-5-5";

/**
 * The slice of the Anthropic client the narrator uses. A real `Anthropic`
 * instance satisfies it structurally; tests inject a stub.
 */
export interface NarratorClient {
  messages: {
    parse: Anthropic["messages"]["parse"];
    create: Anthropic["messages"]["create"];
  };
  beta: {
    messages: {
      create: Anthropic["beta"]["messages"]["create"];
    };
  };
}

let cached: NarratorClient | undefined;

/** True when `ANTHROPIC_API_KEY` is present (and non-blank) in `env`. */
export function isNarratorConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const key = env.ANTHROPIC_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

/** Model id: `NARRATOR_MODEL` when set, else the default. */
export function getModel(): string {
  const override = process.env.NARRATOR_MODEL?.trim();
  return override ? override : DEFAULT_MODEL;
}

/**
 * Returns the injected client when given, otherwise a lazily constructed and
 * memoized `new Anthropic()`. Throws `NarratorUnavailableError` (before any
 * network activity) when no key is configured and nothing was injected.
 */
export function getClient(injected?: NarratorClient): NarratorClient {
  if (injected) return injected;
  if (cached) return cached;
  if (!isNarratorConfigured()) throw new NarratorUnavailableError();
  cached = new Anthropic();
  return cached;
}

/** Drop the memoized client (tests, or after rotating the key at runtime). */
export function resetClientCache(): void {
  cached = undefined;
}
