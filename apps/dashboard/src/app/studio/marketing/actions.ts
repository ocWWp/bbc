"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadBrainSummary } from "@/lib/studio/brain-summary";
import "@/lib/studio/templates"; // registers the 10 templates on the shared registry
import { listTemplateSummaries } from "@/lib/studio/templates/registry";

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
const MAX_TASK_LEN = 500;
const MIN_TASK_LEN = 8;

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Server missing ANTHROPIC_API_KEY. Ask your admin." };
  }

  const supabase = await getSupabaseServerClient();
  const brain = await loadBrainSummary(supabase, a.actor.tenant_id);

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

  const client = new Anthropic({ apiKey });

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
