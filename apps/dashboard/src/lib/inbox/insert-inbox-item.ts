import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export type InboxInsert = {
  tenant_id: string;
  user_id: string;
  channel: "mentions" | "from_bbc";
  kind: "flag_resolved" | "loop3_suggestion" | "mention";
  title: string;
  body?: string;
  source_kind?: "queue_item" | "recommendation" | "memory_file";
  /** queue_items.id (uuid), not the text proposal_id slug. */
  source_queue_item_id?: string;
  source_recommendation_id?: string;
  source_memory_id?: string;
  /** User who filed the originating flag (when kind='flag_resolved'). */
  flagger_user_id?: string;
};

/**
 * Service-role writer for inbox_items. Bypasses RLS — only safe to call from
 * server actions / RPCs that have already validated the recipient. v1.5
 * callers:
 *   - queue resolution hook (Task 32): flag accepted/rejected → notify flagger.
 *   - Loop-3 fan-out (post-launch): tenant.loop3_teammate_visibility='everyone'
 *     → notify teammate users.
 *
 * Throws on insert error so the caller can surface "notification failed" rather
 * than silently lose the row.
 */
export async function insertInboxItem(item: InboxInsert): Promise<string> {
  const supabase = getSupabaseServiceClient();
  // Cast through `unknown` until the supabase types are regenerated against
  // migration 0043 — the table exists in the DB but isn't in the generated
  // `database.types.ts` yet.
  const result = await (supabase as unknown as {
    from: (t: string) => {
      insert: (v: unknown) => {
        select: (cols: string) => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> };
      };
    };
  })
    .from("inbox_items")
    .insert(item)
    .select("id")
    .single();
  if (result.error || !result.data) {
    throw new Error(`insertInboxItem: ${result.error?.message ?? "unknown error"}`);
  }
  return result.data.id;
}
