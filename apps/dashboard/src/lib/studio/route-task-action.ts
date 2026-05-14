"use server";
// "Ask BBC" router. Generalizes marketing's proposeWorkflows over the full
// cross-studio gallery: a small-business user types a task, a small model
// (Haiku) picks 2-4 candidate templates from ANY of the 8 studios. It NEVER
// generates content -- it only routes, deep-linking into the structured
// plan-before-run flow. Cost guards mirror proposeWorkflows: Haiku, bounded
// max_tokens, requireRole("member"), 10/60s rate limit.

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/secrets/anthropic-client";
import { buildGallery } from "@/lib/studio/gallery";
import { TASK_MIN_LEN } from "@/lib/studio/task-limits";
import type { StudioRole } from "@/lib/studio/template-id";

const ROUTE_MODEL = "claude-haiku-4-5-20251001";
const MAX_TASK_INPUT_LEN = 500;

export type RoutedTemplate = {
  templateId: string;
  owningRole: StudioRole;
  label: string;
  rationale: string;
};

export type RouteTaskResult =
  | { ok: true; candidates: RoutedTemplate[] }
  | { ok: false; error: string };

const routeRateLimits = new Map<string, number[]>();
function routeRateLimited(userId: string): boolean {
  const now = Date.now();
  const window = 60_000;
  const max = 10;
  const arr = (routeRateLimits.get(userId) ?? []).filter((t) => now - t < window);
  if (arr.length >= max) {
    routeRateLimits.set(userId, arr);
    return true;
  }
  arr.push(now);
  routeRateLimits.set(userId, arr);
  return false;
}

const routeToolSchema = z.object({
  candidates: z
    .array(
      z.object({
        templateId: z.string().min(1).max(100),
        rationale: z.string().min(1).max(280),
      }),
    )
    .min(1)
    .max(8),
});

const ROUTE_TOOL = {
  name: "route_task",
  description:
    "Pick 2-4 workflow templates across ALL studios that best fit the task. Return only template ids from the provided list -- never invent ids.",
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

export async function routeTask(task: string): Promise<RouteTaskResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };

  if (routeRateLimited(a.actor.user_id)) {
    return { ok: false, error: "Too many requests -- wait a moment and try again." };
  }

  const trimmed = (task ?? "").trim();
  if (trimmed.length < TASK_MIN_LEN) {
    return { ok: false, error: `Describe what you need in at least ${TASK_MIN_LEN} characters.` };
  }
  const capped = trimmed.slice(0, MAX_TASK_INPUT_LEN);

  const supabase = await getSupabaseServerClient();
  const clientRes = await getAnthropicClient(supabase, a.actor.tenant_id);
  if (!clientRes.ok) return { ok: false, error: clientRes.error };
  const { client, costAttribution } = clientRes;

  const gallery = buildGallery();
  const templateLines = gallery
    .map((t) => `- ${t.id} (${t.label}) [${t.roleLabel}]: ${t.hint}`)
    .join("\n");

  const system =
    "You route a small-business task to workflow templates across all 8 BBC studios (marketing, engineering, founder, designer, support, finance, legal, people). Pick 2-4 candidates that genuinely fit, best fit first. Never invent template ids -- only use ids from the list. Each rationale must be specific to THIS task -- no generic copy.";

  const userMessage = [
    `Task: ${capped}`,
    "",
    "Available templates (id, label, [studio], hint):",
    templateLines,
    "",
    "Return 2-4 candidates via the route_task tool.",
  ].join("\n");

  console.info(`studio.routeTask: tenant=${a.actor.tenant_id} cost=${costAttribution}`);

  let resp: Anthropic.Messages.Message;
  try {
    resp = await client.messages.create({
      model: ROUTE_MODEL,
      max_tokens: 1024,
      system,
      tools: [ROUTE_TOOL],
      tool_choice: { type: "tool", name: ROUTE_TOOL.name },
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    return { ok: false, error: `Routing LLM call failed: ${message}` };
  }

  const toolUse = resp.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return { ok: false, error: "LLM returned no structured routing." };
  }

  const parsed = routeToolSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    return { ok: false, error: `LLM returned invalid shape: ${parsed.error.issues[0]?.message ?? "unknown"}` };
  }

  // Filter to ids that exist in the gallery, derive the owning role from the
  // gallery entry, dedupe, cap to 4.
  const byId = new Map(gallery.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const candidates: RoutedTemplate[] = [];
  for (const c of parsed.data.candidates) {
    const g = byId.get(c.templateId);
    if (!g || seen.has(c.templateId)) continue;
    seen.add(c.templateId);
    candidates.push({
      templateId: g.id,
      owningRole: g.owningRole,
      label: g.label,
      rationale: c.rationale.trim(),
    });
    if (candidates.length >= 4) break;
  }

  if (candidates.length < 2) {
    return { ok: false, error: "Couldn't find a good match -- try rephrasing what you need." };
  }

  return { ok: true, candidates };
}
