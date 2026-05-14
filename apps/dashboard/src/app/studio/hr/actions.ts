"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/secrets/anthropic-client";
import { loadBrainSummary, loadTenantMemoryIds } from "@/lib/studio/brain-summary";
import "@/lib/studio/hr-templates"; // side-effect: register the 5 templates
import { getHrTemplate } from "@/lib/studio/hr-templates/registry";
import type { OverrideRule } from "@/lib/studio/hr-templates/types";
import { resolveLlmModel } from "@/lib/studio/resolve-model";
import {
  EMIT_OUTPUT_TOOL_INPUT_SCHEMA,
  emitOutputResponseSchema,
  type OutputBlock,
} from "@/lib/studio/output-blocks";
import { validateRun } from "@/lib/studio/validate-run";
import { logStudioUsage } from "@/lib/studio/usage-log";

/**
 * People/HR Studio — Loop 2 role agent. Job descriptions, offer letters,
 * onboarding plans, review templates, comp rationales. Same shape as the
 * Engineering Studio: no LLM router (the user picks the template directly),
 * plus the conversational override flow. template_id is namespaced "hr:*";
 * runs share the `studio_runs` table and overrides share
 * `studio_template_overrides` (keyed by template_id, so the "hr:*" namespace
 * isolates them).
 *
 * HR output is the `doc` OutputBlock kind. The contract baked into every
 * template + the run system prompt: behavior-anchored always, flag biased
 * language, never invent comp numbers, and loop in counsel for anything with
 * legal exposure (termination, performance management, leave, pay equity).
 */

const RUN_MODEL_FALLBACK = "claude-sonnet-4-6";
const OVERRIDE_PROPOSE_MODEL = "claude-haiku-4-5-20251001";
const MAX_TASK_LEN = 600;
const MIN_TASK_LEN = 8;
const MAX_OUTPUT_TOKENS = 6144;
const MAX_ACTIVE_OVERRIDES = 10;
const MAX_OVERRIDE_MESSAGE_LEN = 1000;
const MIN_OVERRIDE_MESSAGE_LEN = 4;

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
  name: "emit_output_blocks" as const,
  description:
    "Return the generated HR document as a single OutputBlock of kind 'doc' with props { title, doc_type, body_markdown }.",
  input_schema: EMIT_OUTPUT_TOOL_INPUT_SCHEMA,
  cache_control: { type: "ephemeral" as const },
};

// HR inputs can carry pasted context (role scope, agreed terms, comp ranges),
// so the per-value cap is roomier than the marketing/eng default.
const inputsRecordSchema = z.record(z.string(), z.string().max(5000));

export type CitedMemoryRef = {
  id: string;
  title: string;
  type: string | null;
};

export type RunHrWorkflowResult =
  | {
      ok: true;
      runId: string;
      blocks: OutputBlock[];
      citedMemoryIds: string[];
      citedMemories: CitedMemoryRef[];
      droppedCitationCount: number;
    }
  | { ok: false; error: string };

export async function runHrWorkflow(
  templateId: string,
  task: string,
  inputs: Record<string, string>,
): Promise<RunHrWorkflowResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };

  if (runRateLimited(a.actor.user_id)) {
    return { ok: false, error: "Too many runs -- wait a moment and try again." };
  }

  const template = getHrTemplate(templateId);
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

  const [brain, knownMemoryIds, overrides] = await Promise.all([
    loadBrainSummary(supabase, tenantId),
    loadTenantMemoryIds(supabase, tenantId),
    loadActiveOverrides(supabase, tenantId, templateId),
  ]);

  const prompt = template.buildPrompt({
    task: trimmed,
    brain,
    inputs: inputsParsed.data,
    overrides,
  });

  const system =
    "You are BBC's people/HR documents generator. Produce job descriptions, offer letters, onboarding plans, review templates, and comp rationales grounded in the team's people, decisions, and comp bands. HARD RULES: behavior-anchored always -- describe observable behaviors and outcomes, never personality traits; flag and rewrite biased or exclusionary language; you do not give employment-law or legal advice -- add a 'Loop in counsel' callout for anything touching termination, performance management, leave, accommodation, immigration, or pay equity; never invent salary or equity numbers (unknown values stay [BRACKETED]). Cite real memory ids only -- never invent them. Return via the emit_output_blocks tool only.";

  const resolvedModel = await resolveLlmModel(RUN_MODEL_FALLBACK);
  console.info(
    `studio.runHrWorkflow: tenant=${tenantId} template=${templateId} cost=${costAttribution} model=${resolvedModel.model_id} (${resolvedModel.source})`,
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

  logStudioUsage("run", resp, { tenantId, templateId, model: resolvedModel.model_id });

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

  const validated = validateRun({
    blocks: parsed.data.blocks,
    citedMemoryIds: parsed.data.cited_memory_ids,
    knownMemoryIds,
    citationContract: "encouraged",
  });
  if (!validated.ok) return { ok: false, error: validated.error };
  const cleanedBlocks = validated.blocks;
  const validCitedIds = validated.citedMemoryIds;
  const droppedCount = validated.droppedCitations;
  const droppedIdsCount = validated.droppedIds;

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

  revalidatePath("/studio/hr");

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

// ----------------------------------------------------------------------------
// Helpers + conversational override flow.
//
// Mirrors the flow in src/app/studio/engineering/actions.ts. The override
// storage table is shared between studios, keyed by template_id; because HR
// templates use the "hr:*" namespace they never collide with the other
// roles. System prompts and the "what an override is" framing are HR-specific.
// ----------------------------------------------------------------------------

type SupabaseClient = Awaited<ReturnType<typeof getSupabaseServerClient>>;

async function loadActiveOverrides(
  supabase: SupabaseClient,
  tenantId: string,
  templateId: string,
): Promise<OverrideRule[]> {
  const { data } = await supabase
    .from("studio_template_overrides")
    .select("id, kind, value, summary")
    .eq("tenant_id", tenantId)
    .eq("template_id", templateId)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(MAX_ACTIVE_OVERRIDES);

  type OverrideRow = {
    id: string;
    kind: OverrideRule["kind"];
    value: Record<string, unknown> | null;
    summary: string | null;
  };
  const rows = (data ?? []) as unknown as OverrideRow[];
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    value: r.value ?? {},
    summary: r.summary ?? "",
  }));
}

export type ProposedOverride = {
  kind: OverrideRule["kind"];
  value: Record<string, unknown>;
  summary: string;
};

export type ProposeOverrideResult =
  | { ok: true; proposal: ProposedOverride }
  | { ok: false; error: string };

const overrideKindEnum = z.enum([
  "add_constraint",
  "replace_section",
  "add_example",
  "forbid_pattern",
]);

const proposeOverrideSchema = z.object({
  kind: overrideKindEnum,
  value: z.record(z.string(), z.unknown()),
  summary: z.string().min(4).max(280),
});

const PROPOSE_OVERRIDE_TOOL = {
  name: "propose_override",
  description:
    "Convert the user's correction message into one structured override rule. Pick the kind that best fits and return a concrete, actionable value object.",
  input_schema: {
    type: "object" as const,
    properties: {
      kind: {
        type: "string",
        enum: ["add_constraint", "replace_section", "add_example", "forbid_pattern"],
        description:
          "add_constraint: add a 'never/always' rule. replace_section: swap a section of the prompt. add_example: pin a concrete reference (e.g. a JD to model). forbid_pattern: ban a phrase or pattern.",
      },
      value: {
        type: "object",
        description:
          "For add_constraint: { constraint: string }. For replace_section: { target: string, replacement: string }. For add_example: { example: string }. For forbid_pattern: { pattern: string }.",
      },
      summary: {
        type: "string",
        description: "One sentence (max 280 chars) the user will see on the chip.",
      },
    },
    required: ["kind", "value", "summary"],
  },
};

const overrideRateLimits = new Map<string, number[]>();
function overrideRateLimited(userId: string): boolean {
  const now = Date.now();
  const window = 60_000;
  const max = 8;
  const arr = (overrideRateLimits.get(userId) ?? []).filter((t) => now - t < window);
  if (arr.length >= max) {
    overrideRateLimits.set(userId, arr);
    return true;
  }
  arr.push(now);
  overrideRateLimits.set(userId, arr);
  return false;
}

export async function proposeHrOverride(
  templateId: string,
  message: string,
): Promise<ProposeOverrideResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };

  if (overrideRateLimited(a.actor.user_id)) {
    return { ok: false, error: "Too many edit requests -- wait a moment." };
  }

  const template = getHrTemplate(templateId);
  if (!template) return { ok: false, error: `Unknown template: ${templateId}` };

  const trimmed = (message ?? "").trim();
  if (trimmed.length < MIN_OVERRIDE_MESSAGE_LEN) {
    return { ok: false, error: "Tell me what to fix -- at least a few words." };
  }
  if (trimmed.length > MAX_OVERRIDE_MESSAGE_LEN) {
    return { ok: false, error: `Message too long -- keep it under ${MAX_OVERRIDE_MESSAGE_LEN} characters.` };
  }

  const supabase = await getSupabaseServerClient();
  const clientRes = await getAnthropicClient(supabase, a.actor.tenant_id);
  if (!clientRes.ok) return { ok: false, error: clientRes.error };
  const { client, costAttribution } = clientRes;

  const existing = await loadActiveOverrides(supabase, a.actor.tenant_id, templateId);
  const existingBlurb = existing.length
    ? existing.map((o) => `- (${o.kind}) ${o.summary}`).join("\n")
    : "(none)";

  const system =
    "You convert a user's correction into a structured prompt override for a people/HR documents workflow (job descriptions, offer letters, onboarding plans, review templates, comp rationales). Pick the most specific override kind. Keep value fields concrete (a constraint sentence, a pattern, an example). Do not invent rules the user did not state. Never duplicate an existing override. Never produce an override that weakens the behavior-anchored or bias-flagging requirements -- those are non-negotiable.";

  const userMessage = [
    `Template: ${template.label} (${template.id}).`,
    `Template purpose: ${template.hint}`,
    "",
    "Existing active overrides:",
    existingBlurb,
    "",
    `User correction: ${trimmed}`,
    "",
    "Return one override via the propose_override tool.",
  ].join("\n");

  console.info(
    `studio.proposeHrOverride: tenant=${a.actor.tenant_id} template=${templateId} cost=${costAttribution}`,
  );
  let resp: Anthropic.Messages.Message;
  try {
    resp = await client.messages.create({
      model: OVERRIDE_PROPOSE_MODEL,
      max_tokens: 512,
      system,
      tools: [PROPOSE_OVERRIDE_TOOL],
      tool_choice: { type: "tool", name: PROPOSE_OVERRIDE_TOOL.name },
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : "unknown";
    return { ok: false, error: `Override LLM call failed: ${m}` };
  }

  const toolUse = resp.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return { ok: false, error: "LLM returned no structured override." };
  }
  const parsed = proposeOverrideSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    return {
      ok: false,
      error: `LLM returned invalid shape: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    };
  }

  return { ok: true, proposal: parsed.data };
}

const RUN_ID_RE = /^[0-9a-fA-F-]{36}$/;

export type SaveOverrideInput = {
  templateId: string;
  proposal: ProposedOverride;
  sourceRunId?: string;
};

export type SaveOverrideResult =
  | { ok: true; overrideId: string }
  | { ok: false; error: string };

export async function saveHrStudioTemplateOverride(
  input: SaveOverrideInput,
): Promise<SaveOverrideResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };

  const template = getHrTemplate(input.templateId);
  if (!template) return { ok: false, error: `Unknown template: ${input.templateId}` };

  const proposalParsed = proposeOverrideSchema.safeParse(input.proposal);
  if (!proposalParsed.success) {
    return { ok: false, error: "Invalid override shape." };
  }
  if (input.sourceRunId && !RUN_ID_RE.test(input.sourceRunId)) {
    return { ok: false, error: "Invalid run id." };
  }

  const supabase = await getSupabaseServerClient();

  const { count, error: countErr } = await supabase
    .from("studio_template_overrides")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", a.actor.tenant_id)
    .eq("template_id", input.templateId)
    .eq("active", true);
  if (countErr) return { ok: false, error: countErr.message };
  if ((count ?? 0) >= MAX_ACTIVE_OVERRIDES) {
    return {
      ok: false,
      error: `Already at the ${MAX_ACTIVE_OVERRIDES}-override cap for this workflow. Deactivate one first.`,
    };
  }

  const { data: inserted, error } = await supabase
    .from("studio_template_overrides")
    .insert({
      tenant_id: a.actor.tenant_id,
      created_by: a.actor.user_id,
      template_id: input.templateId,
      kind: proposalParsed.data.kind,
      value: proposalParsed.data.value,
      summary: proposalParsed.data.summary,
      source_run_id: input.sourceRunId ?? null,
      active: true,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Could not save override." };
  }
  revalidatePath("/studio/hr");
  return { ok: true, overrideId: (inserted as { id: string }).id };
}

export type ActiveOverrideSummary = {
  id: string;
  kind: OverrideRule["kind"];
  summary: string;
  createdAt: string;
};

export async function listActiveHrOverrides(
  templateId: string,
): Promise<{ ok: true; overrides: ActiveOverrideSummary[] } | { ok: false; error: string }> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("studio_template_overrides")
    .select("id, kind, summary, created_at")
    .eq("tenant_id", a.actor.tenant_id)
    .eq("template_id", templateId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error) return { ok: false, error: error.message };
  type Row = { id: string; kind: OverrideRule["kind"]; summary: string | null; created_at: string };
  return {
    ok: true,
    overrides: ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      kind: r.kind,
      summary: r.summary ?? "",
      createdAt: r.created_at,
    })),
  };
}

export async function deactivateHrStudioOverride(
  overrideId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };
  if (!RUN_ID_RE.test(overrideId)) return { ok: false, error: "Invalid override id." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("studio_template_overrides")
    .update({ active: false })
    .eq("id", overrideId)
    .eq("tenant_id", a.actor.tenant_id)
    .eq("created_by", a.actor.user_id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  // The pill lists every active override for the tenant, but the update is
  // scoped to rows this user created. A zero-row update means the override
  // belongs to a teammate -- report failure so the pill doesn't drop it
  // locally while the next run still applies it.
  if (!data || data.length === 0) {
    return { ok: false, error: "You can only deactivate customizations you created." };
  }
  revalidatePath("/studio/hr");
  return { ok: true };
}
