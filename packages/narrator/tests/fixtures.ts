import type { NarratorClient } from "../src/client";
import type { NarrationInput } from "../src/types";

export function sampleInput(): NarrationInput {
  return {
    ticker: "XYZ",
    eventDate: "2025-10-14",
    eventTitle: "PDUFA for drug ABC",
    kind: "fda",
    session: "premarket",
    score: 84.3,
    direction: "bearish",
    band: "someone-knew",
    signals: [
      {
        key: "directionalPremium",
        label: "Directional premium",
        weight: 0.25,
        z: 3.2,
        contribution: 20,
        footprintValue: 4_120_000,
        baselineMean: 310_000,
        detail: { askPutPremium: 4_120_000 },
      },
      {
        key: "flowIntensity",
        label: "Flow intensity",
        weight: 0.25,
        z: 2.7,
        contribution: 16.9,
        footprintValue: 41,
        baselineMean: 12.5,
        detail: { alerts: 41 },
      },
      {
        key: "darkPool",
        label: "Dark pool",
        weight: 0.1,
        z: 0.4,
        contribution: 1,
        footprintValue: 1_500_000,
        baselineMean: 1_200_000,
        detail: {},
      },
    ],
    topAlerts: [
      {
        executedAt: "2025-10-09T14:32:00Z",
        type: "put",
        strike: 150,
        expiry: "2025-11-21",
        premium: 4_120_000,
        size: 1200,
        side: "ask",
        isSweep: true,
        underlyingPrice: 171.4,
      },
      {
        executedAt: "2025-10-10T15:05:00Z",
        type: "put",
        strike: 145,
        expiry: "2025-11-21",
        premium: 850_400,
        size: 400,
        side: "ask",
        isSweep: false,
      },
    ],
    verdict: { verdict: "matched", realizedMovePct: -18.6, impliedMovePct: 11.2, reactionWindow: "T" },
    flags: { insufficientHistory: false, multiCatalyst: false, partialWindow: false, isIndexOrEtf: false },
  };
}

export const CLEAN_STORY =
  "XYZ's PDUFA for drug ABC on 2025-10-14 scored 84, bearish, in someone-knew territory. Directional premium (z-score 3.2) and Flow intensity (z-score 2.7) led, with the largest alert $4.1M of ask-side puts at the $150 strike expiring 2025-11-21 at 14:32. The options market implied an 11.2% move and the stock fell 19%, so the footprint matched.";
export const CLEAN_CAPTION =
  "Five days before the PDUFA, $4.1M of ask-side puts hit XYZ. Score 84, bearish. Stock fell 19%. Someone knew.";
export const BAD_STORY = CLEAN_STORY.replace("$4.1M", "$9.9M");

export interface FakeCall {
  method: "parse" | "create" | "betaCreate";
  params: unknown;
}

type Handler = (params: unknown, nth: number) => unknown;

export interface FakeHandlers {
  parse?: Handler;
  create?: Handler;
  betaCreate?: Handler;
}

/** The investigator loop pushes onto its `messages` array after each call; copy it so recorded params stay as sent. */
function snapshot(params: unknown): unknown {
  if (params && typeof params === "object" && Array.isArray((params as { messages?: unknown }).messages)) {
    return { ...params, messages: [...(params as { messages: unknown[] }).messages] };
  }
  return params;
}

/** A structural stand-in for `Anthropic` whose three entry points return canned responses. */
export function fakeClient(handlers: FakeHandlers): { client: NarratorClient; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const invoke = async (method: FakeCall["method"], params: unknown): Promise<unknown> => {
    calls.push({ method, params: snapshot(params) });
    const nth = calls.filter((c) => c.method === method).length;
    const handler = handlers[method];
    if (!handler) throw new Error(`${method} was not stubbed`);
    return handler(params, nth);
  };
  const client = {
    messages: {
      parse: (params: unknown) => invoke("parse", params),
      create: (params: unknown) => invoke("create", params),
    },
    beta: { messages: { create: (params: unknown) => invoke("betaCreate", params) } },
  };
  return { client: client as unknown as NarratorClient, calls };
}

/** Minimal shape of a `messages.parse` response. */
export function parsedMessage(parsed_output: unknown, stop_reason = "end_turn"): unknown {
  return {
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: [{ type: "text", text: JSON.stringify(parsed_output) }],
    stop_reason,
    stop_sequence: null,
    parsed_output,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

/** Minimal shape of a `messages.create` / `beta.messages.create` response. */
export function message(content: unknown[], stop_reason = "end_turn"): unknown {
  return {
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

export function toolUse(id: string, name: string, input: unknown): unknown {
  return { type: "tool_use", id, name, input };
}

export function text(t: string): unknown {
  return { type: "text", text: t };
}
