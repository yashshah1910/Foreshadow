import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getModel, isNarratorConfigured, resetClientCache } from "../src/client";
import { NarratorError, NarratorUnavailableError } from "../src/errors";
import { narrateEvent, narrationCacheKey } from "../src/narrator";
import { BAD_STORY, CLEAN_CAPTION, CLEAN_STORY, fakeClient, parsedMessage, sampleInput } from "./fixtures";

type ParseParams = Anthropic.MessageCreateParamsNonStreaming;

beforeEach(() => {
  resetClientCache();
  vi.stubEnv("NARRATOR_MODEL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("narrateEvent", () => {
  it("parses story and caption on the happy path and sends the expected request", async () => {
    const { client, calls } = fakeClient({
      parse: () => parsedMessage({ story: CLEAN_STORY, caption: CLEAN_CAPTION }),
    });
    const result = await narrateEvent(sampleInput(), { client });
    expect(result).toEqual({
      story: CLEAN_STORY,
      caption: CLEAN_CAPTION,
      model: "claude-haiku-5-5",
      numbersVerified: true,
      unverifiedNumbers: [],
    });
    expect(calls).toHaveLength(1);
    const params = calls[0].params as ParseParams;
    expect(params.model).toBe("claude-haiku-5-5");
    expect(params.max_tokens).toBe(2048);
    expect(params.output_config?.effort).toBe("low");
    expect(params.output_config?.format?.type).toBe("json_schema");
    expect(params.system).toEqual([
      expect.objectContaining({ type: "text", cache_control: { type: "ephemeral" } }),
    ]);
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].role).toBe("user");
    expect(String(params.messages[0].content)).toContain('"ticker": "XYZ"');
  });

  it("retries exactly once with the offending numbers when verification fails", async () => {
    const { client, calls } = fakeClient({
      parse: (_params, nth) =>
        parsedMessage(
          nth === 1
            ? { story: BAD_STORY, caption: CLEAN_CAPTION }
            : { story: CLEAN_STORY, caption: CLEAN_CAPTION },
        ),
    });
    const result = await narrateEvent(sampleInput(), { client });
    expect(calls).toHaveLength(2);
    const retry = calls[1].params as ParseParams;
    expect(retry.messages).toHaveLength(3);
    expect(retry.messages[1].role).toBe("assistant");
    expect(retry.messages[2].role).toBe("user");
    expect(String(retry.messages[2].content)).toContain("$9.9M");
    expect(result.numbersVerified).toBe(true);
    expect(result.story).toBe(CLEAN_STORY);
  });

  it("returns numbersVerified: false after one failed retry, without a third call", async () => {
    const { client, calls } = fakeClient({
      parse: () => parsedMessage({ story: BAD_STORY, caption: CLEAN_CAPTION }),
    });
    const result = await narrateEvent(sampleInput(), { client });
    expect(calls).toHaveLength(2);
    expect(result.numbersVerified).toBe(false);
    expect(result.unverifiedNumbers).toEqual(["$9.9M"]);
    expect(result.story).toBe(BAD_STORY);
  });

  it("throws NarratorUnavailableError before any call when the key is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(isNarratorConfigured()).toBe(false);
    const { calls } = fakeClient({ parse: () => parsedMessage({ story: CLEAN_STORY, caption: CLEAN_CAPTION }) });
    await expect(narrateEvent(sampleInput())).rejects.toBeInstanceOf(NarratorUnavailableError);
    expect(calls).toHaveLength(0);
  });

  it("uses an injected client even without a key, and honours model overrides", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("NARRATOR_MODEL", "claude-opus-5-5");
    expect(getModel()).toBe("claude-opus-5-5");
    const { client, calls } = fakeClient({ parse: () => parsedMessage({ story: CLEAN_STORY, caption: CLEAN_CAPTION }) });
    const viaEnv = await narrateEvent(sampleInput(), { client });
    expect(viaEnv.model).toBe("claude-opus-5-5");
    const viaOpt = await narrateEvent(sampleInput(), { client, model: "claude-opus-5" });
    expect(viaOpt.model).toBe("claude-opus-5");
    expect((calls[1].params as ParseParams).model).toBe("claude-opus-5");
  });

  it("wraps SDK errors as NarratorError with a readable message", async () => {
    const { client } = fakeClient({
      parse: () => {
        throw new Anthropic.RateLimitError(429, undefined, "rate limited", new Headers());
      },
    });
    const err = await narrateEvent(sampleInput(), { client }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NarratorError);
    expect((err as NarratorError).status).toBe(429);
    expect((err as NarratorError).message).toContain("narrateEvent: Claude API error 429");
  });

  it("wraps structured-output parse failures and refusals", async () => {
    const malformed = fakeClient({
      parse: () => {
        throw new Anthropic.AnthropicError("Failed to parse structured output");
      },
    });
    await expect(narrateEvent(sampleInput(), { client: malformed.client })).rejects.toBeInstanceOf(NarratorError);
    const refused = fakeClient({ parse: () => parsedMessage(null, "refusal") });
    await expect(narrateEvent(sampleInput(), { client: refused.client })).rejects.toThrow(/declined/);
  });
});

describe("narrationCacheKey", () => {
  it("is ticker:eventDate:score", () => {
    expect(narrationCacheKey({ ticker: "XYZ", eventDate: "2025-10-14", score: 84.3 })).toBe("XYZ:2025-10-14:84.3");
  });
});

describe("isNarratorConfigured", () => {
  it("reads the given env", () => {
    // Next augments ProcessEnv with a required NODE_ENV, hence the cast.
    const env = (vars: Record<string, string>): NodeJS.ProcessEnv => vars as NodeJS.ProcessEnv;
    expect(isNarratorConfigured(env({ ANTHROPIC_API_KEY: "sk-ant-test" }))).toBe(true);
    expect(isNarratorConfigured(env({ ANTHROPIC_API_KEY: "   " }))).toBe(false);
    expect(isNarratorConfigured(env({}))).toBe(false);
  });
});
