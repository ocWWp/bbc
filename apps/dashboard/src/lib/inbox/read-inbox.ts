import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireActor } from "@/lib/auth/require-user";

export type InboxItem = {
  id: string;
  channel: "mentions" | "from_bbc";
  kind: string;
  title: string;
  body: string | null;
  source_kind: "queue_item" | "recommendation" | "memory_file" | null;
  source_queue_item_id: string | null;
  source_recommendation_id: string | null;
  source_memory_id: string | null;
  flagger_user_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type InboxView = {
  from_bbc: InboxItem[];
  mentions: InboxItem[];
  /** Total unread count in the from_bbc channel only — used for the bell badge.
   *  Mentions has no producer in v1.5 and must not contribute. */
  from_bbc_unread: number;
  /** Whether the mentions tab should be visible at all. Hidden until there is
   *  at least one mentions row historically. */
  mentions_visible: boolean;
};

const LIST_COLUMNS =
  "id, channel, kind, title, body, source_kind, source_queue_item_id, source_recommendation_id, source_memory_id, flagger_user_id, read_at, created_at";

/**
 * Reads the calling actor's inbox, split by channel. RLS enforces ownership.
 * Items are ordered newest-first; unread come first within each channel.
 */
export async function readInbox(limit = 50): Promise<InboxView> {
  const a = await requireActor();
  if (!a.ok) {
    return { from_bbc: [], mentions: [], from_bbc_unread: 0, mentions_visible: false };
  }
  const supabase = await getSupabaseServerClient();

  const { data } = await supabase
    .from("inbox_items")
    .select(LIST_COLUMNS)
    .eq("user_id", a.actor.user_id)
    .eq("tenant_id", a.actor.tenant_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as InboxItem[];

  const from_bbc: InboxItem[] = [];
  const mentions: InboxItem[] = [];
  for (const r of rows) {
    if (r.channel === "mentions") mentions.push(r);
    else from_bbc.push(r);
  }

  // Sort each channel: unread first, then created_at desc.
  const byUnreadThenTime = (a: InboxItem, b: InboxItem) => {
    if (!a.read_at && b.read_at) return -1;
    if (a.read_at && !b.read_at) return 1;
    return b.created_at.localeCompare(a.created_at);
  };
  from_bbc.sort(byUnreadThenTime);
  mentions.sort(byUnreadThenTime);

  const from_bbc_unread = from_bbc.filter((r) => !r.read_at).length;

  return {
    from_bbc,
    mentions,
    from_bbc_unread,
    mentions_visible: mentions.length > 0,
  };
}
