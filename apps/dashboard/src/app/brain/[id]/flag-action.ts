"use server";

import { requireActor } from "@/lib/auth/require-user";
import { getStore } from "@/lib/store";
import { getMemoryItem } from "../../memory/queries";

export type FlagResult =
  | { ok: true; id: string }
  | { ok: false; code: "unauthorized" | "invalid_input" | "not_found" | "store_error"; error?: string };

/**
 * Task 16: members file a "flag" proposal on a brain memory.
 *
 * Members are read-only against memory_files (RLS-gated; see Task 0a). The
 * Flag-this affordance is how they suggest a change — it creates a pending
 * proposal that an admin sees in /queue and accepts or rejects.
 *
 * Uses `fileProposal` (Task 0d) which routes to:
 *   - file-mode: scripts/propose.sh
 *   - db-mode: propose_change SQL function (RLS-gated for the inserter)
 */
export async function flagMemory(formData: FormData): Promise<FlagResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, code: "unauthorized" };

  const memoryId = String(formData.get("memory_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!memoryId || !reason) return { ok: false, code: "invalid_input" };

  // Cross-tenant sanity check. getMemoryItem already filters by the actor's
  // tenant_id at the Supabase query level, but we re-check here so the
  // server action never opens a hole that depends on the query helper.
  const memory = await getMemoryItem(memoryId);
  if (!memory || memory.tenant_id !== a.actor.tenant_id) {
    return { ok: false, code: "not_found" };
  }

  // memory_files.path is already the repo-relative path inside memory/. Fall
  // back to an id-keyed path for legacy rows that have a null path.
  const targetFile = memory.path ?? `memory/files/${memoryId}.md`;
  const truncatedReason = reason.length > 80 ? `${reason.slice(0, 80)}…` : reason;

  const store = await getStore();
  const result = await store.queue.fileProposal({
    tenant_id: a.actor.tenant_id,
    target_file: targetFile,
    change_kind: "flag",
    summary: `Flag: ${truncatedReason}`,
    body: [
      `Flagged by ${a.actor.actor} (${a.actor.role}):`,
      "",
      reason,
      "",
      `— filed from /brain/${memoryId}`,
    ].join("\n"),
    source_memory_id: memoryId,
  });

  if (!result.ok) {
    return { ok: false, code: "store_error", error: result.output };
  }
  return { ok: true, id: result.id ?? "" };
}
