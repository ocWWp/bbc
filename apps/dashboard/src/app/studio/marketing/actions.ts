"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/secrets/anthropic-client";
import { loadBrainSummary, loadTenantMemoryIds } from "@/lib/studio/brain-summary";
import "@/lib/studio/templates"; // registers the 10 templates on the shared registry
import {
  getTemplate,
  listTemplateSummaries,
} from "@/lib/studio/templates/registry";
import type { OverrideRule } from "@/lib/studio/templates/types";
import {
  cleanBlockCitations,
  EMIT_OUTPUT_TOOL_INPUT_SCHEMA,
  emitOutputResponseSchema,
  type OutputBlock,
} from "@/lib/studio/output-blocks";

/**
 * SECURITY:
 * - Every action passes through requireActor() + requireRole("member"). Viewers
 *   can read /studio/marketing but cannot run workflows.
 * - All DB reads/writes go through the user's Supabase session, never the
 *   service role. RLS on studio_runs / studio_template_overrides / memory_files
 *   gates everything tenant-side.
 * - LLM input is capped (MAX_TASK_LEN) and the input is the user's own task
 *   string, not arbitrary memory content -- there is no prompt-injection path
 *   from the brain to other tenants' data.
 *
 * COST GUARDS:
 * - max_tokens is set on every call; no unbounded outputs.
 * - proposeWorkflows uses a small model (Haiku) for fan-out -- runWorkflow uses
 *   Sonnet because the output is the actual user-facing content.
 */

const PROPOSE_MODEL = "claude-haiku-4-5-20251001";
const RUN_MODEL = "claude-sonnet-4-6";
const MAX_TASK_LEN = 500;
const MIN_TASK_LEN = 8;
const MAX_ACTIVE_OVERRIDES = 10;

const proposeRateLimits = new Map<string, number[]>();
function proposeRateLimited(userId: string): boolean {
  const now = Date.now();
  const window = 60_000;
  const max = 10;
  const arr = (proposeRateLimits.get(userId) ?? []).filter((t) => now - t < window);
  if (arr.length >= max) {
    proposeRateLimits.set(userId, arr);
    return true;
  }
  arr.push(now);
  proposeRateLimits.set(userId, arr);
  return false;
}

export type TemplateProposal = {
  templateId: string;
  label: string;
  rationale: string;
};

export type ProposeWorkflowsResult =
  | { ok: true; candidates: TemplateProposal[] }
  | { ok: false; error: string };

const proposeToolSchema = z.object({
  candidates: z
    .array(
      z.object({
        templateId: z.string().min(1).max(100),
        rationale: z.string().min(1).max(280),
      }),
    )
    .min(1)
    .max(6),
});

const PROPOSE_TOOL = {
  name: "propose_templates",
  description:
    "Pick 2-4 workflow templates that best match the founder's task. Return only template ids from the provided list -- never invent ids.",
  input_schema: {
    type: "object" as const,
    properties: {
      candidates: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            templateId: {
              type: "string",
              description: "Exact id from the provided template list.",
            },
            rationale: {
              type: "string",
              description:
                "One sentence (max 280 chars) explaining why this template fits this task. No fluff.",
            },
          },
          required: ["templateId", "rationale"],
        },
      },
    },
    required: ["candidates"],
  },
};

export async function proposeWorkflows(task: string): Promise<ProposeWorkflowsResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };

  if (proposeRateLimited(a.actor.user_id)) {
    return { ok: false, error: "Too many proposals -- wait a moment and try again." };
  }

  const trimmed = (task ?? "").trim();
  if (trimmed.length < MIN_TASK_LEN) {
    return { ok: false, error: `Describe the task in at least ${MIN_TASK_LEN} characters.` };
  }
  if (trimmed.length > MAX_TASK_LEN) {
    return { ok: false, error: `Task too long -- keep it under ${MAX_TASK_LEN} characters.` };
  }

  const supabase = await getSupabaseServerClient();
  const brain = await loadBrainSummary(supabase, a.actor.tenant_id);
  const clientRes = await getAnthropicClient(supabase, a.actor.tenant_id);
  if (!clientRes.ok) return { ok: false, error: clientRes.error };
  const { client, costAttribution } = clientRes;

  const templates = listTemplateSummaries();
  const templateLines = templates.map((t) => `- ${t.id} (${t.label}): ${t.hint}`).join("\n");

  const brainBlurb = [
    brain.voice
      ? `Voice register: ${brain.voice.register}. Do words: ${brain.voice.do_words.slice(0, 5).join(", ") || "(none)"}.`
      : "Voice: not set.",
    brain.product
      ? `Product positioning: ${brain.product.positioning || "(not set)"}. Target user: ${brain.product.target_user || "(not set)"}.`
      : "Product: not set.",
    brain.recent_decisions.length
      ? `Recent decisions: ${brain.recent_decisions.map((d) => d.title).slice(0, 3).join("; ")}.`
      : "No recent decisions logged.",
  ].join(" ");

  const system =
    "You route marketing tasks to workflow templates. Pick 2-4 candidates that genuinely fit. Order them by best fit first. Never pick `custom` if a more specific template applies. Never invent template ids -- only use ids from the list. Each rationale must be specific to THIS task (no generic copy).";

  const userMessage = [
    `Founder task: ${trimmed}`,
    "",
    `Brain context: ${brainBlurb}`,
    "",
    "Available templates:",
    templateLines,
    "",
    "Return 2-4 candidates via the propose_templates tool.",
  ].join("\n");

  console.info(
    `studio.proposeWorkflows: tenant=${a.actor.tenant_id} cost=${costAttribution}`,
  );

  let resp: Anthropic.Messages.Message;
  try {
    resp = await client.messages.create({
      model: PROPOSE_MODEL,
      max_tokens: 1024,
      system,
      tools: [PROPOSE_TOOL],
      tool_choice: { type: "tool", name: PROPOSE_TOOL.name },
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    return { ok: false, error: `Proposal LLM call failed: ${message}` };
  }

  const toolUse = resp.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return { ok: false, error: "LLM returned no structured proposal." };
  }

  const parsed = proposeToolSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    return { ok: false, error: `LLM returned invalid shape: ${parsed.error.issues[0]?.message ?? "unknown"}` };
  }

  // Filter to ids that actually exist in our registry, dedupe, cap to 4.
  const known = new Set(templates.map((t) => t.id));
  const labelById = new Map(templates.map((t) => [t.id, t.label]));
  const seen = new Set<string>();
  const candidates: TemplateProposal[] = [];
  for (const c of parsed.data.candidates) {
    if (!known.has(c.templateId) || seen.has(c.templateId)) continue;
    seen.add(c.templateId);
    candidates.push({
      templateId: c.templateId,
      label: labelById.get(c.templateId) ?? c.templateId,
      rationale: c.rationale.trim(),
    });
    if (candidates.length >= 4) break;
  }

  if (candidates.length < 2) {
    return { ok: false, error: "LLM produced too few valid candidates -- try rephrasing the task." };
  }

  return { ok: true, candidates };
}

// ----------------------------------------------------------------------------
// runWorkflow -- executes one template against the user's task + inputs.
// ----------------------------------------------------------------------------

export type CitedMemoryRef = {
  id: string;
  title: string;
  type: string | null;
};

export type RunWorkflowResult =
  | {
      ok: true;
      runId: string;
      blocks: OutputBlock[];
      citedMemoryIds: string[];
      citedMemories: CitedMemoryRef[];
      droppedCitationCount: number;
    }
  | { ok: false; error: string };

const runRateLimits = new Map<string, number[]>();
function runRateLimited(userId: string): boolean {
  const now = Date.now();
  const window = 60_000;
  const max = 6;
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
    "Return the generated content as an array of typed output blocks plus the set of memory ids you cited inline. Use the exact block kinds listed in the schema.",
  input_schema: EMIT_OUTPUT_TOOL_INPUT_SCHEMA,
};

const inputsRecordSchema = z.record(z.string(), z.string().max(2000));

export async function runWorkflow(
  templateId: string,
  task: string,
  inputs: Record<string, string>,
): Promise<RunWorkflowResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };

  if (runRateLimited(a.actor.user_id)) {
    return { ok: false, error: "Too many runs -- wait a moment and try again." };
  }

  const template = getTemplate(templateId);
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

  // Enforce required first-use inputs server-side. UI also validates, but
  // never trust the client.
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
    "You are BBC's marketing copy generator. Generate content that is in the founder's voice (per the prompt) and grounded in the brain (cite real memory ids only). Never invent facts. Return via the emit_output_blocks tool only.";

  console.info(
    `studio.runWorkflow: tenant=${tenantId} template=${templateId} cost=${costAttribution}`,
  );

  let resp: Anthropic.Messages.Message;
  try {
    resp = await client.messages.create({
      model: RUN_MODEL,
      max_tokens: 4096,
      system,
      tools: [EMIT_OUTPUT_TOOL],
      tool_choice: { type: "tool", name: EMIT_OUTPUT_TOOL.name },
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    await insertErroredRun(supabase, {
      tenantId,
      userId: a.actor.user_id,
      templateId,
      task: trimmed,
      inputs: inputsParsed.data,
      errorMessage: `LLM call failed: ${message}`,
    });
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

  // Strip citations that point at memory not owned by this tenant. Also strip
  // claimed cited_memory_ids that aren't in the tenant's brain. Both are
  // defense in depth -- the LLM operates only on the brain summary we passed
  // so cross-tenant references shouldn't occur, but we don't trust that.
  let droppedCount = 0;
  const cleanedBlocks: OutputBlock[] = parsed.data.blocks.map((b) => {
    const { block, stripped } = cleanBlockCitations(b, knownMemoryIds);
    droppedCount += stripped;
    return block;
  });
  const validCitedIds = parsed.data.cited_memory_ids.filter((id) => knownMemoryIds.has(id));
  const droppedIdsCount = parsed.data.cited_memory_ids.length - validCitedIds.length;
  if (droppedCount > 0 || droppedIdsCount > 0) {
    console.warn(
      `studio.runWorkflow: stripped ${droppedCount} inline citations + ${droppedIdsCount} ids (tenant=${tenantId}, template=${templateId})`,
    );
  }

  const insertPayload = {
    tenant_id: tenantId,
    created_by: a.actor.user_id,
    template_id: templateId,
    task: trimmed,
    inputs: inputsParsed.data,
    output_blocks: cleanedBlocks,
    cited_memory_ids: validCitedIds,
    status: "pending_review" as const,
    completed_at: new Date().toISOString(),
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("studio_runs")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return {
      ok: false,
      error: `Could not save run: ${insertErr?.message ?? "unknown"}`,
    };
  }

  revalidatePath("/studio/marketing");

  // Hydrate cited memory titles for the citation strip. We already validated
  // every id belongs to the tenant, so this query is bounded + safe.
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
// Helpers
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

// ----------------------------------------------------------------------------
// Accept / reject / edit -- queue-style review actions on a studio_run.
// All three guard tenant_id + created_by (RLS would too, but defense in depth).
// ----------------------------------------------------------------------------

const RUN_ID_RE = /^[0-9a-fA-F-]{36}$/;

export type ReviewResult = { ok: true } | { ok: false; error: string };

async function authedRunOwnership(
  runId: string,
): Promise<
  | { ok: true; supabase: SupabaseClient; userId: string; tenantId: string }
  | { ok: false; error: string }
> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };
  if (!RUN_ID_RE.test(runId)) return { ok: false, error: "Invalid run id." };
  const supabase = await getSupabaseServerClient();
  return {
    ok: true,
    supabase,
    userId: a.actor.user_id,
    tenantId: a.actor.tenant_id,
  };
}

export async function acceptStudioRun(runId: string): Promise<ReviewResult> {
  const g = await authedRunOwnership(runId);
  if (!g.ok) return g;
  const { error } = await g.supabase
    .from("studio_runs")
    .update({ status: "accepted", completed_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("tenant_id", g.tenantId)
    .eq("created_by", g.userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/studio/marketing");
  return { ok: true };
}

export async function rejectStudioRun(runId: string): Promise<ReviewResult> {
  const g = await authedRunOwnership(runId);
  if (!g.ok) return g;
  const { error } = await g.supabase
    .from("studio_runs")
    .update({ status: "rejected", completed_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("tenant_id", g.tenantId)
    .eq("created_by", g.userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/studio/marketing");
  return { ok: true };
}

// Edit is for small inline fixups in the canvas: the user retypes a sentence,
// we persist the updated block array but leave the status untouched. The full
// rewrite flow is "Edit this workflow" (J.14) which materializes an override
// and reruns -- that is a separate action.
export async function editStudioRun(
  runId: string,
  newBlocks: unknown,
): Promise<ReviewResult> {
  const g = await authedRunOwnership(runId);
  if (!g.ok) return g;

  const arr = z.array(z.unknown()).safeParse(newBlocks);
  if (!arr.success || arr.data.length === 0 || arr.data.length > 8) {
    return { ok: false, error: "Output must be a 1-8 block array." };
  }
  // Re-validate every block against the discriminated union. Server is the
  // authority on shape -- the client can submit anything.
  const validated: OutputBlock[] = [];
  for (const raw of arr.data) {
    const r = emitOutputResponseSchema.shape.blocks.element.safeParse(raw);
    if (!r.success) {
      return {
        ok: false,
        error: `Invalid block: ${r.error.issues[0]?.message ?? "unknown shape"}`,
      };
    }
    validated.push(r.data);
  }

  const { error } = await g.supabase
    .from("studio_runs")
    .update({ output_blocks: validated })
    .eq("id", runId)
    .eq("tenant_id", g.tenantId)
    .eq("created_by", g.userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/studio/marketing");
  return { ok: true };
}

async function insertErroredRun(
  supabase: SupabaseClient,
  args: {
    tenantId: string;
    userId: string;
    templateId: string;
    task: string;
    inputs: Record<string, string>;
    errorMessage: string;
  },
): Promise<void> {
  await supabase.from("studio_runs").insert({
    tenant_id: args.tenantId,
    created_by: args.userId,
    template_id: args.templateId,
    task: args.task,
    inputs: args.inputs,
    output_blocks: [],
    cited_memory_ids: [],
    status: "error" as const,
    error_message: args.errorMessage,
    completed_at: new Date().toISOString(),
  });
}

// ----------------------------------------------------------------------------
// Conversational workflow editing (J.14 + J.15)
//
// proposeOverride: takes the user's correction message ("this always misses
// our product taglines"), asks the LLM to convert it into a structured
// override rule, returns it for review. Does NOT persist.
//
// saveStudioTemplateOverride: persists a previously-proposed override after
// the user clicks save. The next runWorkflow call merges it into the prompt
// via overridesClause().
//
// listActiveOverrides: lightweight read for the UI pill ("2 customizations").
// ----------------------------------------------------------------------------

const OVERRIDE_PROPOSE_MODEL = "claude-haiku-4-5-20251001";
const MAX_OVERRIDE_MESSAGE_LEN = 1000;
const MIN_OVERRIDE_MESSAGE_LEN = 4;

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
          "add_constraint: add a 'never/always' rule. replace_section: swap a section of the prompt. add_example: pin a style example. forbid_pattern: ban a phrase or pattern.",
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

export async function proposeOverride(
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

  const template = getTemplate(templateId);
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
    "You convert founder corrections into structured prompt overrides for a marketing workflow template. Pick the most specific override kind. Keep value fields concrete (a constraint sentence, a pattern, an example). Do not invent rules the founder did not state. Never duplicate an existing override.";

  const userMessage = [
    `Template: ${template.label} (${template.id}).`,
    `Template purpose: ${template.hint}`,
    "",
    "Existing active overrides:",
    existingBlurb,
    "",
    `Founder correction: ${trimmed}`,
    "",
    "Return one override via the propose_override tool.",
  ].join("\n");

  console.info(
    `studio.proposeOverride: tenant=${a.actor.tenant_id} template=${templateId} cost=${costAttribution}`,
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

export type SaveOverrideInput = {
  templateId: string;
  proposal: ProposedOverride;
  sourceRunId?: string;
};

export type SaveOverrideResult =
  | { ok: true; overrideId: string }
  | { ok: false; error: string };

export async function saveStudioTemplateOverride(
  input: SaveOverrideInput,
): Promise<SaveOverrideResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };

  const template = getTemplate(input.templateId);
  if (!template) return { ok: false, error: `Unknown template: ${input.templateId}` };

  const proposalParsed = proposeOverrideSchema.safeParse(input.proposal);
  if (!proposalParsed.success) {
    return { ok: false, error: "Invalid override shape." };
  }
  if (input.sourceRunId && !RUN_ID_RE.test(input.sourceRunId)) {
    return { ok: false, error: "Invalid run id." };
  }

  const supabase = await getSupabaseServerClient();

  // Enforce the active-overrides cap (10 per template per tenant).
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
  revalidatePath("/studio/marketing");
  return { ok: true, overrideId: (inserted as { id: string }).id };
}

export type ActiveOverrideSummary = {
  id: string;
  kind: OverrideRule["kind"];
  summary: string;
  createdAt: string;
};

export async function listActiveOverrides(
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

export async function deactivateStudioOverride(
  overrideId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };
  if (!RUN_ID_RE.test(overrideId)) return { ok: false, error: "Invalid override id." };

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("studio_template_overrides")
    .update({ active: false })
    .eq("id", overrideId)
    .eq("tenant_id", a.actor.tenant_id)
    .eq("created_by", a.actor.user_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/studio/marketing");
  return { ok: true };
}
