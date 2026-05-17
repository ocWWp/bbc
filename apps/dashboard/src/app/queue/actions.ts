"use server";

import { revalidatePath } from "next/cache";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getStore } from "@/lib/store";
import { notifyFlagResolved } from "@/lib/inbox/notify-flag-resolved";

const PROPOSAL_ID_RE = /^prop_[\w:.-]+$/;

/**
 * SECURITY:
 * - Auth gate at top: every action requires a Supabase-authenticated session
 *   whose profile row was created by the invitation trigger on auth.users.
 *   The DB trigger is the canonical signup gate; this server-side check is
 *   defense in depth.
 * - Role gate: Accept/Reject require role >= 'member' in the user's tenant.
 *   Viewers can read but not mutate.
 * - The store handles transport: file-mode shells out to scripts/{accept,
 *   reject}.sh; DB-mode invokes accept_proposal()/reject_proposal() SQL
 *   functions via supabase.rpc. Both are atomic at the transport layer.
 * - Inputs validated via strict regex before reaching the transport.
 */

type Result = { ok: boolean; output: string };

export async function acceptProposal(formData: FormData): Promise<Result> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, output: a.output };
  const r = requireRole(a.actor, "operator");
  if (!r.ok) return { ok: false, output: r.output };

  const id = String(formData.get("id") ?? "");
  if (!PROPOSAL_ID_RE.test(id)) {
    return { ok: false, output: `Invalid proposal_id: ${id}` };
  }

  const store = await getStore();
  const result = await store.queue.acceptProposal(id, a.actor.actor);

  if (result.ok) {
    // Task 32: if this was a member-filed flag, drop a row in the
    // flagger's inbox. Non-flag proposals are a no-op inside the hook.
    // Notification failures are non-blocking — the accept itself
    // already committed; surface as a server log line and move on.
    try {
      await notifyFlagResolved({
        tenant_id: a.actor.tenant_id,
        proposal_id: id,
        resolution: "accepted",
      });
    } catch (err) {
      console.error("notifyFlagResolved (accept) failed", err);
    }
    revalidatePath("/");
    // /queue is now a redirect to /ops; the cockpit is the canonical queue
    // surface and needs to invalidate so accept/reject from its inline list
    // doesn't show stale rows. /queue stays in case any edge cache holds
    // the redirect response. /queue/[id] still exists as a detail view.
    revalidatePath("/ops");
    revalidatePath("/queue");
    revalidatePath(`/queue/${id}`);
    revalidatePath("/settings/log");
  }
  return result;
}

export async function rejectProposal(formData: FormData): Promise<Result> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, output: a.output };
  const r = requireRole(a.actor, "operator");
  if (!r.ok) return { ok: false, output: r.output };

  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!PROPOSAL_ID_RE.test(id)) {
    return { ok: false, output: `Invalid proposal_id: ${id}` };
  }
  if (!reason || reason.length > 500) {
    return { ok: false, output: "Reason is required (≤ 500 chars)." };
  }

  const store = await getStore();
  const result = await store.queue.rejectProposal(id, a.actor.actor, reason);

  if (result.ok) {
    // Task 32: see acceptProposal note. Pass reason through so the
    // inbox row body shows the operator's rationale to the flagger.
    try {
      await notifyFlagResolved({
        tenant_id: a.actor.tenant_id,
        proposal_id: id,
        resolution: "rejected",
        resolution_note: reason,
      });
    } catch (err) {
      console.error("notifyFlagResolved (reject) failed", err);
    }
    revalidatePath("/");
    // See acceptProposal: /ops is the canonical queue surface now.
    revalidatePath("/ops");
    revalidatePath("/queue");
    revalidatePath(`/queue/${id}`);
    revalidatePath("/settings/log");
  }
  return result;
}
