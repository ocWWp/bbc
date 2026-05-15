// ToolRegistry — declares v1.6's tool kit and narrows per intent.
//
// All v1.6 tools are scope='internal'. Per ADR-0009 v1.6 amendment, the
// durable tool execution envelope (browser-use, send-email, write APIs)
// is v1.7 work; v1.6 keeps every tool internal so the blast radius of a
// runaway agent is bounded.

import type { Intent } from "./types";

export type ToolDef = {
  name: string;
  description: string;
  scope: "internal"; // v1.6 — `external` lands in v1.7
  inputSchema: Record<string, unknown>;
};

/**
 * Frozen at module load — `readonly` is TS-only; `Object.freeze` makes the
 * immutability enforceable against careless or hostile importers (codex
 * M1 review P2 #3).
 */
export const TOOLS: readonly ToolDef[] = Object.freeze([
  {
    name: "memory_search",
    scope: "internal",
    description:
      "Search the tenant's memory by free-text query, optionally filtered by supertag.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        kinds: { type: "array", items: { type: "string" } },
        limit: { type: "number" },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_fetch",
    scope: "internal",
    description: "Fetch a single memory row by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "route_match",
    scope: "internal",
    description:
      "Map a navigation phrase to a route path (e.g. 'admin dashboard' → '/dashboard').",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "studio_compose",
    scope: "internal",
    description:
      "Compose a draft using an existing Studio template (e.g. tweet-thread, blog-post).",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string" },
        template: { type: "string" },
        inputs: { type: "object" },
      },
      required: ["role", "template"],
    },
  },
  {
    name: "observer_propose",
    scope: "internal",
    description:
      "Preview a watch proposal from local adapter metadata. ZERO external calls and ZERO persistence — returns the spec only, per the three-step consent flow.",
    inputSchema: {
      type: "object",
      properties: {
        metric: { type: "string" },
        signalType: { type: "string" },
      },
      required: ["metric"],
    },
  },
  {
    name: "observation_emit",
    scope: "internal",
    description:
      "Emit an observation finding. Routes through propose_observation() RPC (M3); never creates a memory_files row directly.",
    inputSchema: {
      type: "object",
      properties: {
        signalId: { type: "string" },
        anomaly: { type: "object" },
        hypothesis: { type: "string" },
        citations: { type: "array", items: { type: "string" } },
      },
      required: ["signalId", "anomaly", "hypothesis"],
    },
  },
] as const) as readonly ToolDef[];

const BY_INTENT: Readonly<Record<Intent, readonly string[]>> = Object.freeze({
  navigate: ["route_match"],
  explain: ["memory_search", "memory_fetch"],
  draft: ["memory_search", "memory_fetch", "studio_compose"],
  watch: ["observer_propose"],
  meta: ["memory_search"],
  unclear: [],
  "observe-anomaly": ["memory_search", "memory_fetch", "observation_emit"],
});

export function toolsForIntent(intent: Intent): readonly ToolDef[] {
  const allowed = BY_INTENT[intent];
  // Preserve TOOLS array order in the returned list so prompt assembly is
  // deterministic.
  return TOOLS.filter((t) => allowed.includes(t.name));
}
