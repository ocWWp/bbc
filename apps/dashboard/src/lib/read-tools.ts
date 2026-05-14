/**
 * Thin shim — preserves the read-* import pattern. Implementation lives in @bbc/store.
 *
 * Phase L1 read path for the role-tool-bundle catalog. Marketing Studio will
 * call resolveRoleTool("llm-provider") to learn which adapter to use, instead
 * of hardcoding Anthropic. See .planning/phases/L1-role-tool-bundle/PLAN.md.
 */
export type { Tool } from "@bbc/store";
import type { Tool } from "@bbc/store";
import { getStore } from "./store";

export async function listTools(): Promise<Tool[]> {
  const store = await getStore();
  return store.tools.list();
}

export async function resolveRoleTool(role: string): Promise<Tool | null> {
  const store = await getStore();
  return store.tools.resolveRole(role);
}

export async function candidateToolsFor(role: string): Promise<Tool[]> {
  const store = await getStore();
  return store.tools.candidatesFor(role);
}
