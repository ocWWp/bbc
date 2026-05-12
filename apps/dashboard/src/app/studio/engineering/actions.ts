"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/secrets/anthropic-client";
import { loadBrainSummary, loadTenantMemoryIds } from "@/lib/studio/brain-summary";
import "@/lib/studio/eng-templates"; // side-effect: register the 3 templates
import { getEngTemplate } from "@/lib/studio/eng-templates/registry";
import { resolveLlmModel } from "@/lib/studio/resolve-model";
import {
  cleanBlockCitations,
  EMIT_OUTPUT_TOOL_INPUT_SCHEMA,
  emitOutputResponseSchema,
  type OutputBlock,
} from "@/lib/studio/output-blocks";

/**
 * Engineering Studio — second Loop 2 role agent. Slimmer than the Marketing
 * Studio: no LLM template router (the user picks the template directly), no
 * conversational override flow (deferred). Writes into the same `studio_runs`
 * table -- template_id is namespaced "eng:*" so it doesn't clash with marketing.
 *
 * Security and cost guards mirror marketing actions.ts: requireRole("member"),
 * RLS on every read/write, capped task length, bounded max_tokens.
 */

const RUN_MODEL_FALLBACK = "claude-sonnet-4-6";
const MAX_TASK_LEN = 600;
const MIN_TASK_LEN = 8;
const MAX_OUTPUT_TOKENS = 6144;

const runRateLimits = new Map<string, number[]>();
function runRateLimited(userId: string): boolean {
  const now = Date.now();
  const window = 60_000;
  const max = 4;
  const arr = (runRateLimits.get(userId) ?? []).filter((t) => now - t < window);
  if (arr.length >= max) {
    runRateLimits.set(userId, arr);
    return true;
  }
  arr.push(now);
  runRateLimits.set(userId, arr);
  return false;
}

const EMIT_OUTPUT_TOOL = {
  name: "emit_output_blocks",
  description:
    "Return the generated engineering document as a single OutputBlock of kind 'plain' carrying the full markdown in props.text.",
  input_schema: EMIT_OUTPUT_TOOL_INPUT_SCHEMA,
};

const inputsRecordSchema = z.record(z.string(), z.string().max(3000));

export type CitedMemoryRef = {
  id: string;
  title: string;
  type: string | null;
};

export type RunEngWorkflowResult =
  | {
      ok: true;
      runId: string;
      blocks: OutputBlock[];
      citedMemoryIds: string[];
      citedMemories: CitedMemoryRef[];
      droppedCitationCount: number;
    }
  | { ok: false; error: string };

export async function runEngineeringWorkflow(
  templateId: string,
  task: string,
  inputs: Record<string, string>,
): Promise<RunEngWorkflowResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };

  if (runRateLimited(a.actor.user_id)) {
    return { ok: false, error: "Too many runs -- wait a moment and try again." };
  }

  const template = getEngTemplate(templateId);
  if (!template) return { ok: false, error: `Unknown template: ${templateId}` };

  const trimmed = (task ?? "").trim();
  if (trimmed.length < MIN_TASK_LEN) {
    return { ok: false, error: `Describe the task in at least ${MIN_TASK_LEN} characters.` };
  }
  if (trimmed.length > MAX_TASK_LEN) {
    return { ok: false, error: `Task too long -- keep it under ${MAX_TASK_LEN} characters.` };
  }

  const inputsParsed = inputsRecordSchema.safeParse(inputs ?? {});
  if (!inputsParsed.success) {
    return { ok: false, error: "Invalid inputs shape." };
  }

  for (const fi of template.firstUseInputs) {
    if (fi.required && !inputsParsed.data[fi.id]) {
      return { ok: false, error: `Missing required input: ${fi.label}` };
    }
  }

  const supabase = await getSupabaseServerClient();
  const tenantId = a.actor.tenant_id;

  const clientRes = await getAnthropicClient(supabase, tenantId);
  if (!clientRes.ok) return { ok: false, error: clientRes.error };
  const { client, costAttribution } = clientRes;

  const [brain, knownMemoryIds] = await Promise.all([
    loadBrainSummary(supabase, tenantId),
    loadTenantMemoryIds(supabase, tenantId),
  ]);

  const prompt = template.buildPrompt({
    task: trimmed,
    brain,
    inputs: inputsParsed.data,
    overrides: [],
  });

  const system =
    "You are BBC's engineering documents generator. Produce ADRs, vendor proposals, and tech-debt reviews grounded in the team's existing decisions and vendors. Cite real memory ids only -- never invent them. Return via the emit_output_blocks tool only.";

  const resolvedModel = await resolveLlmModel(RUN_MODEL_FALLBACK);
  console.info(
    `studio.runEngineeringWorkflow: tenant=${tenantId} template=${templateId} cost=${costAttribution} model=${resolvedModel.model_id} (${resolvedModel.source})`,
  );

  let resp: Anthropic.Messages.Message;
  try {
    resp = await client.messages.create({
      model: resolvedModel.model_id,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      tools: [EMIT_OUTPUT_TOOL],
      tool_choice: { type: "tool", name: EMIT_OUTPUT_TOOL.name },
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    return { ok: false, error: `Generator failed: ${message}` };
  }

  const toolUse = resp.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return { ok: false, error: "Generator returned no structured output." };
  }

  const parsed = emitOutputResponseSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Generator returned invalid shape: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    };
  }

  let droppedCount = 0;
  const cleanedBlocks: OutputBlock[] = parsed.data.blocks.map((b) => {
    const { block, stripped } = cleanBlockCitations(b, knownMemoryIds);
    droppedCount += stripped;
    return block;
  });
  const validCitedIds = parsed.data.cited_memory_ids.filter((id) => knownMemoryIds.has(id));
  const droppedIdsCount = parsed.data.cited_memory_ids.length - validCitedIds.length;

  const { data: inserted, error: insertErr } = await supabase
    .from("studio_runs")
    .insert({
      tenant_id: tenantId,
      created_by: a.actor.user_id,
      template_id: templateId,
      task: trimmed,
      inputs: inputsParsed.data,
      output_blocks: cleanedBlocks,
      cited_memory_ids: validCitedIds,
      status: "pending_review" as const,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return { ok: false, error: `Could not save run: ${insertErr?.message ?? "unknown"}` };
  }

  revalidatePath("/studio/engineering");

  let citedMemories: CitedMemoryRef[] = [];
  if (validCitedIds.length > 0) {
    const { data: titleRows } = await supabase
      .from("memory_files")
      .select("id, title, type")
      .in("id", validCitedIds);
    type TitleRow = { id: string; title: string | null; type: string | null };
    citedMemories = ((titleRows ?? []) as TitleRow[]).map((r) => ({
      id: r.id,
      title: (r.title ?? "").trim() || "untitled",
      type: r.type ?? null,
    }));
  }

  return {
    ok: true,
    runId: (inserted as { id: string }).id,
    blocks: cleanedBlocks,
    citedMemoryIds: validCitedIds,
    citedMemories,
    droppedCitationCount: droppedCount + droppedIdsCount,
  };
}
