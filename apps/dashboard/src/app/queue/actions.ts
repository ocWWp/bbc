"use server";

import { revalidatePath } from "next/cache";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getStore } from "@/lib/store";

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
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, output: r.output };

  const id = String(formData.get("id") ?? "");
  if (!PROPOSAL_ID_RE.test(id)) {
    return { ok: false, output: `Invalid proposal_id: ${id}` };
  }

  const store = await getStore();
  const result = await store.queue.acceptProposal(id, a.actor.actor);

  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/queue");
    revalidatePath(`/queue/${id}`);
    revalidatePath("/log");
  }
  return result;
}

export async function rejectProposal(formData: FormData): Promise<Result> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, output: a.output };
  const r = requireRole(a.actor, "member");
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
    revalidatePath("/");
    revalidatePath("/queue");
    revalidatePath(`/queue/${id}`);
    revalidatePath("/log");
  }
  return result;
}
