import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { insertInboxItem } from "./insert-inbox-item";

export type NotifyFlagResolvedInput = {
  tenant_id: string;
  /** The text proposal_id slug from queue_items.proposal_id. */
  proposal_id: string;
  resolution: "accepted" | "rejected";
  /** Optional reject reason; surfaced in the inbox row body when present. */
  resolution_note?: string;
};

type QueueItemRow = {
  id: string;
  frontmatter: Record<string, unknown> | null;
};

/**
 * Task 32: when an operator resolves a flag-proposal, drop a row into the
 * flagger's inbox so they see the result.
 *
 * Reads the queue_item by proposal_id to extract:
 *   - id (uuid) — what we link from the inbox row
 *   - frontmatter.change_kind — must be 'flag' (otherwise this is a no-op)
 *   - frontmatter.proposed_by — the flagger's user_id (per Task 0d's
 *     propose_change RPC writes proposed_by into the frontmatter)
 *   - frontmatter.source_memory_id — the memory being flagged
 *
 * Silently no-ops when:
 *   - the queue item can't be found (race with delete, unlikely)
 *   - change_kind is not 'flag' (admin edits / vendor swaps / etc.)
 *   - proposed_by is missing (legacy proposals)
 *
 * Errors from insertInboxItem propagate — the caller decides whether to
 * surface them.
 */
export async function notifyFlagResolved(input: NotifyFlagResolvedInput): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("queue_items")
    .select("id, frontmatter")
    .eq("tenant_id", input.tenant_id)
    .eq("proposal_id", input.proposal_id)
    .maybeSingle();

  if (error || !data) return;
  const row = data as QueueItemRow;
  const fm = (row.frontmatter ?? {}) as Record<string, unknown>;

  if (fm.change_kind !== "flag") return;

  const proposedBy = typeof fm.proposed_by === "string" ? fm.proposed_by : null;
  if (!proposedBy) return;

  const sourceMemoryId =
    typeof fm.source_memory_id === "string" ? fm.source_memory_id : undefined;

  await insertInboxItem({
    tenant_id: input.tenant_id,
    user_id: proposedBy,
    channel: "from_bbc",
    kind: "flag_resolved",
    title:
      input.resolution === "accepted"
        ? "Your flag was accepted"
        : "Your flag was reviewed",
    body: input.resolution_note,
    source_kind: "queue_item",
    source_queue_item_id: row.id,
    source_memory_id: sourceMemoryId,
    flagger_user_id: proposedBy,
  });
}
