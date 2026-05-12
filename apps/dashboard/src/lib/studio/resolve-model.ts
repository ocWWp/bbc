import "server-only";
import { resolveRoleTool } from "@/lib/read-tools";

/**
 * Resolve the LLM model_id for a Studio run by consulting the role-tool-bundle.
 *
 * Calls `resolveRoleTool("llm-provider")` (Phase L1) and returns the bound
 * adapter's metadata.model_id when present. Falls back to the caller's
 * `fallback` constant when the catalog has nothing useful — so the Studio
 * never blocks on missing bindings.
 *
 * The role naming ("llm-provider") matches the bindings.yaml table and
 * the `implements:` field on provider YAMLs. Future Phase L1.1 work can
 * split this into `llm-provider-fast` + `llm-provider-quality` once we
 * decide whether one Studio call needs both registers.
 */
export type ResolvedModel = {
  model_id: string;
  source: "binding" | "fallback";
  provider_id?: string;
};

export async function resolveLlmModel(fallback: string): Promise<ResolvedModel> {
  try {
    const tool = await resolveRoleTool("llm-provider");
    if (tool && tool.status !== "archived") {
      const modelId = tool.metadata?.model_id;
      if (typeof modelId === "string" && modelId.length > 0) {
        return { model_id: modelId, source: "binding", provider_id: tool.provider_id };
      }
    }
  } catch (e) {
    // Catalog read failure must not block Studio runs. Log and fall back.
    const m = e instanceof Error ? e.message : "unknown";
    console.warn(`resolveLlmModel: catalog read failed, using fallback (${m})`);
  }
  return { model_id: fallback, source: "fallback" };
}
