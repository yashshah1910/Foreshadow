import { OFF_TOPIC_REPLY, type InvestigateResult } from "@foreshadow/narrator";

/**
 * What the browser gets: the answer and which sources were used. Tool inputs
 * and outputs stay on the server, so raw Unusual Whales MCP results never
 * leave it.
 */
export function publicAnswer(result: InvestigateResult) {
  return {
    answer: result.answer,
    model: result.model,
    stopped: result.stopped,
    toolCalls: result.toolCalls.map(({ name, source, ok }) => ({ name, source, ok })),
    offTopic: result.answer.trim() === OFF_TOPIC_REPLY,
  };
}
