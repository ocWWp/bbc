"use server";
// Shared plan-before-run preview for ALL 8 studios. Does NOT call the LLM.
// Validates like run<Role>Workflow (task bounds + per-role input caps + required
// first-use inputs) so a previewed plan can never be confirmed into a run that
// predictably fails. Candidate-memory + planSummary copy lifted verbatim from
// marketing/actions.ts previewPlan (PR #9 / e7de654) -- keep the trust copy exact.

import { z } from "zod";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadBrainSummary } from "@/lib/studio/brain-summary";
import { resolveTemplate } from "@/lib/studio/resolve-template";
import { TASK_MIN_LEN, TASK_MAX_LEN, INPUT_MAX_LEN } from "@/lib/studio/task-limits";
import type { PlanPreview } from "@/lib/studio/plan-preview";

export type PreviewPlanResult =
  | { ok: true; plan: PlanPreview }
  | { ok: false; error: string };

export async function previewPlan(
  templateId: string,
  task: string,
  inputs: Record<string, string>,
): Promise<PreviewPlanResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };

  const resolved = resolveTemplate(templateId);
  if (!resolved) return { ok: false, error: `Unknown template: ${templateId}` };
  const { role, template } = resolved;

  const trimmed = (task ?? "").trim();
  if (trimmed.length < TASK_MIN_LEN) {
    return { ok: false, error: `Describe the task in at least ${TASK_MIN_LEN} characters.` };
  }
  if (trimmed.length > TASK_MAX_LEN[role]) {
    return { ok: false, error: `Task too long -- keep it under ${TASK_MAX_LEN[role]} characters.` };
  }

  // Per-role input cap -- matches the run action's inputsRecordSchema for `role`.
  const parsedInputs = z.record(z.string(), z.string().max(INPUT_MAX_LEN[role])).safeParse(inputs ?? {});
  if (!parsedInputs.success) return { ok: false, error: "Invalid inputs." };
  for (const fi of template.firstUseInputs) {
    if (fi.required && !(parsedInputs.data[fi.id] ?? "").trim()) {
      return { ok: false, error: `Missing required input: ${fi.label}` };
    }
  }

  const supabase = await getSupabaseServerClient();
  const brain = await loadBrainSummary(supabase, a.actor.tenant_id);

  // Candidate memory = every id-bearing brain type. metrics/comp_bands are
  // forward-wired (loadBrainSummary does not populate them yet) but are included
  // so finance/HR plans surface them automatically once that memory type lands.
  const candidateMemories: PlanPreview["candidateMemories"] = [
    ...brain.recent_decisions.map((d) => ({ id: d.id, kind: "decision", label: d.title })),
    ...brain.vendors.map((v) => ({ id: v.id, kind: "vendor", label: `${v.name} (${v.role})` })),
    ...brain.team.map((t) => ({ id: t.id, kind: "team", label: `${t.name} (${t.role})` })),
    ...(brain.glossary?.terms ?? []).map((g) => ({ id: g.id, kind: "glossary", label: g.term })),
    ...(brain.metrics ?? []).map((m) => ({ id: m.id, kind: "metric", label: `${m.label}: ${m.value}` })),
    ...(brain.comp_bands ?? []).map((c) => ({ id: c.id, kind: "comp_band", label: `${c.label}: ${c.range}` })),
  ];

  // voice + product feed every template's prompt but carry no id -- always-on
  // context, surfaced separately so a voice-only tenant never sees "nothing matched".
  const alwaysOnContext: string[] = [];
  if (brain.voice) alwaysOnContext.push("Voice");
  if (brain.product) alwaysOnContext.push("Product positioning");

  // planSummary -- VERBATIM from marketing/actions.ts previewPlan (e7de654).
  const n = candidateMemories.length;
  const docKind = template.kind.replace(/_/g, " ");
  const grounding =
    n > 0
      ? `grounded in ${n} ${n === 1 ? "piece" : "pieces"} of your company memory` +
        (alwaysOnContext.length > 0 ? " plus your always-on voice and product context" : "")
      : alwaysOnContext.length > 0
        ? "drawing on your always-on voice and product context"
        : "based only on the task and inputs you typed";
  const planSummary =
    `Generate a ${docKind} using the "${template.label}" template, ${grounding}. ` +
    `The draft goes to your review queue -- nothing is sent, published, or written ` +
    `back to memory until you approve it.`;

  return {
    ok: true,
    plan: { templateId, templateLabel: template.label, task: trimmed, inputs: parsedInputs.data, planSummary, candidateMemories, alwaysOnContext },
  };
}
