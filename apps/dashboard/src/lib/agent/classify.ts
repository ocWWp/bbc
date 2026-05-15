// classifyIntent — Haiku-tier pre-classifier for the conversation path.
//
// Per the v1.6 design doc: a dedicated cheap model call over the latest
// user input + last 2 turns produces one of 6 conversational intents
// (navigate, explain, draft, watch, meta, unclear). The observer path
// skips classification entirely — observerRun() passes 'observe-anomaly'
// directly.
//
// Cost target: ~$0.0001/turn at Haiku rates (5-7M input tokens per $1).
//
// Stateless: caller injects the LLM. We never import the Anthropic SDK
// here; the dependency lives at the orchestrator layer where binding
// resolution + provider routing happen.

import type { ConversationTurn, ConversationalIntent, Intent } from "./types";

const CONVERSATIONAL_INTENTS = new Set<ConversationalIntent>([
  "navigate",
  "explain",
  "draft",
  "watch",
  "meta",
  "unclear",
]);

/**
 * The classifier may return any `Intent` shape at runtime (LLM is free
 * to emit anything), but the function NEVER hands `observe-anomaly` back
 * to the caller. Anything outside the conversational subset becomes
 * `unclear`.
 */
export type ClassifierLlm = (input: {
  text: string;
  recent: ConversationTurn[];
}) => Promise<{ intent: Intent }>;

/**
 * Classify the user's intent. Returns `unclear` on any failure path:
 *   - LLM rejects (network, rate limit, timeout)
 *   - LLM returns a value outside the 6-intent vocabulary
 *   - LLM returns 'observe-anomaly' (reserved for the observer path)
 *
 * The fallback is deliberately conservative: when the model fails or
 * misbehaves, the orchestrator should fall through to a tool-less reply
 * asking the user for clarification, not silently pick a default intent.
 */
export async function classifyIntent(
  text: string,
  recent: readonly ConversationTurn[],
  llm: ClassifierLlm,
): Promise<ConversationalIntent> {
  try {
    const r = await llm({
      text,
      recent: recent.slice(-2) as ConversationTurn[],
    });
    if (
      !CONVERSATIONAL_INTENTS.has(r.intent as ConversationalIntent)
    ) {
      return "unclear";
    }
    return r.intent as ConversationalIntent;
  } catch {
    return "unclear";
  }
}
