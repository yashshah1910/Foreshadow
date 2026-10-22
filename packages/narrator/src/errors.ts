import Anthropic from "@anthropic-ai/sdk";

/** Thrown before any network call when no API key is configured and no client was injected. */
export class NarratorUnavailableError extends Error {
  constructor(message = "ANTHROPIC_API_KEY is not configured; Claude narration is unavailable") {
    super(message);
    this.name = "NarratorUnavailableError";
  }
}

/** Wraps SDK errors (and malformed structured output) with a readable message. */
export class NarratorError extends Error {
  readonly status: number | undefined;

  constructor(message: string, options: { cause?: unknown; status?: number } = {}) {
    super(message, { cause: options.cause });
    this.name = "NarratorError";
    this.status = options.status;
  }
}

/**
 * Convert an SDK error into a `NarratorError`. Anything that is not an SDK
 * error is returned unchanged so callers can `throw toNarratorError(err, ...)`.
 */
export function toNarratorError(err: unknown, surface: string): unknown {
  if (err instanceof Anthropic.APIError) {
    const status = typeof err.status === "number" ? err.status : undefined;
    const label = status === undefined ? "Claude API connection error" : `Claude API error ${status}`;
    return new NarratorError(`${surface}: ${label}: ${err.message}`, { cause: err, status });
  }
  if (err instanceof Anthropic.AnthropicError) {
    return new NarratorError(`${surface}: ${err.message}`, { cause: err });
  }
  return err;
}
