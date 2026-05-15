"use server";

import { revalidatePath } from "next/cache";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import "@/lib/studio/writebacks"; // side-effect: register emitters
import {
  getWritebackEmitter,
  type FiledArtifact,
  type FiledProposal,
  type WritebackContext,
} from "@/lib/studio/writebacks";
import type { OutputBlock } from "@/lib/studio/output-blocks";

/**
 * Generic accept/reject for any Studio run regardless of which studio created
 * it. Marketing has its own copy that revalidates /studio/marketing; this one
 * revalidates the unified viewer + the index. Both use the same RLS-gated
 * ownership check (tenant + created_by).
 *
 * On accept, if a writeback emitter is registered for the run's template_id,
 * the emitter runs and files queue_items proposals (and optionally direct
 * source_artifact rows for audit). The returned result includes whatever
 * was filed so the UI can surface "N proposals filed" + a deep link to
 * /queue.
 */

const RUN_ID_RE = /^[0-9a-fA-F-]{36}$/;

export type AcceptResult =
  | {
      ok: true;
      proposals: FiledProposal[];
      artifacts: FiledArtifact[];
    }
  | { ok: false; error: string };

export type ReviewResult = { ok: true } | { ok: false; error: string };

export async function acceptRun(runId: string): Promise<AcceptResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };
  if (!RUN_ID_RE.test(runId)) return { ok: false, error: "Invalid run id." };

  const supabase = await getSupabaseServerClient();

  // Load the run before flipping status -- the writeback emitter needs the
  // template_id, task, inputs, and output_blocks. Doing this first also
  // gates against accepting a run the user can't see (RLS will return null).
  const { data: row, error: loadErr } = await supabase
    .from("studio_runs")
    .select("id, template_id, task, inputs, output_blocks, cited_memory_ids, status")
    .eq("id", runId)
    .eq("tenant_id", a.actor.tenant_id)
    .eq("created_by", a.actor.user_id)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!row) return { ok: false, error: "Run not found or not yours." };

  type Row = {
    id: string;
    template_id: string;
    task: string;
    inputs: Record<string, string> | null;
    output_blocks: OutputBlock[];
    cited_memory_ids: string[];
    status: string;
  };
  const run = row as unknown as Row;
  if (run.status !== "pending_review") {
    return { ok: false, error: `Run is already ${run.status}.` };
  }

  // Flip status first so the writeback's queue_items inserts can reference
  // a definitively-accepted run. If writebacks fail after this, the run
  // stays accepted -- a partial writeback is better than a stuck run, and
  // the queue is the source of truth for proposals regardless.
  const { error: updateErr } = await supabase
    .from("studio_runs")
    .update({ status: "accepted", completed_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("tenant_id", a.actor.tenant_id)
    .eq("created_by", a.actor.user_id);
  if (updateErr) return { ok: false, error: updateErr.message };

  // Writeback step. No emitter for this template = no-op.
  const emitter = getWritebackEmitter(run.template_id);
  let proposals: FiledProposal[] = [];
  let artifacts: FiledArtifact[] = [];
  if (emitter) {
    const ctx: WritebackContext = {
      runId: run.id,
      templateId: run.template_id,
      task: run.task,
      inputs: run.inputs ?? {},
      outputBlocks: run.output_blocks ?? [],
      citedMemoryIds: run.cited_memory_ids ?? [],
      tenantId: a.actor.tenant_id,
      userId: a.actor.user_id,
      userActor: a.actor.actor,
    };
    try {
      const result = await emitter.emit(ctx, supabase);
      proposals = result.proposals;
      artifacts = result.artifacts;
    } catch (e) {
      // Don't fail the accept on writeback errors -- log and return what
      // we got. The run is still accepted; the partial writeback (if any)
      // is in /queue. The error surfaces in the server log for triage.
      const m = e instanceof Error ? e.message : "unknown";
      console.error(
        `studio.acceptRun: writeback failed for run=${run.id} template=${run.template_id}: ${m}`,
      );
    }
  }

  revalidatePath(`/studio/runs/${runId}`);
  revalidatePath("/gallery");
  if (proposals.length > 0) revalidatePath("/queue");
  return { ok: true, proposals, artifacts };
}

export async function rejectRun(runId: string): Promise<ReviewResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };
  if (!RUN_ID_RE.test(runId)) return { ok: false, error: "Invalid run id." };

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("studio_runs")
    .update({ status: "rejected", completed_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("tenant_id", a.actor.tenant_id)
    .eq("created_by", a.actor.user_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/studio/runs/${runId}`);
  revalidatePath("/gallery");
  return { ok: true };
}
