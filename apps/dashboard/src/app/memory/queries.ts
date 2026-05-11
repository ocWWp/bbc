import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireActor } from "@/lib/auth/require-user";
import type { Supertag } from "@/lib/memory/types";
import type { Database } from "@/lib/supabase/database.types";

type RelationKind = Database["public"]["Enums"]["memory_relation_kind"];

export type MemoryItemRow = Database["public"]["Tables"]["memory_files"]["Row"];

const LIST_COLUMNS = "id, type, title, slug, status, updated_at, fields";

export async function listMemoryItems(opts: { type?: Supertag; q?: string; status?: "draft" | "active" | "archived" | "all" } = {}) {
  const a = await requireActor();
  if (!a.ok) return [];
  const supabase = await getSupabaseServerClient();
  let q = supabase
    .from("memory_files")
    .select(LIST_COLUMNS)
    .eq("tenant_id", a.actor.tenant_id)
    .order("updated_at", { ascending: false });
  if (opts.type) q = q.eq("type", opts.type);
  if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
  else if (!opts.status) q = q.in("status", ["draft", "active"]);
  if (opts.q) q = q.ilike("title", `%${opts.q}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getMemoryItem(id: string): Promise<MemoryItemRow | null> {
  const a = await requireActor();
  if (!a.ok) return null;
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("memory_files")
    .select("*")
    .eq("tenant_id", a.actor.tenant_id)
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

export async function getRelations(itemId: string) {
  const a = await requireActor();
  if (!a.ok) return { outgoing: [], incoming: [] };
  const supabase = await getSupabaseServerClient();
  const tenantId = a.actor.tenant_id;

  const [outgoing, incoming] = await Promise.all([
    supabase
      .from("memory_relations")
      .select("id, kind, dst:dst_id(id, type, title, slug)")
      .eq("tenant_id", tenantId)
      .eq("src_id", itemId),
    supabase
      .from("memory_relations")
      .select("id, kind, src:src_id(id, type, title, slug)")
      .eq("tenant_id", tenantId)
      .eq("dst_id", itemId),
  ]);

  return {
    outgoing: (outgoing.data ?? []) as Array<{ id: string; kind: RelationKind; dst: { id: string; type: Supertag; title: string; slug: string } | null }>,
    incoming: (incoming.data ?? []) as Array<{ id: string; kind: RelationKind; src: { id: string; type: Supertag; title: string; slug: string } | null }>,
  };
}

export async function getNeighborhood(id: string, depth = 2) {
  const a = await requireActor();
  if (!a.ok) return { nodes: [], edges: [] };
  const supabase = await getSupabaseServerClient();
  const tenantId = a.actor.tenant_id;
  const visited = new Set<string>([id]);
  const edges: Array<{ id: string; kind: RelationKind; src_id: string; dst_id: string }> = [];
  let frontier = [id];

  for (let d = 0; d < depth && frontier.length > 0; d++) {
    const [{ data: out }, { data: inc }] = await Promise.all([
      supabase.from("memory_relations").select("id, kind, src_id, dst_id").eq("tenant_id", tenantId).in("src_id", frontier),
      supabase.from("memory_relations").select("id, kind, src_id, dst_id").eq("tenant_id", tenantId).in("dst_id", frontier),
    ]);
    const all: Array<{ id: string; kind: RelationKind; src_id: string; dst_id: string }> = [
      ...((out ?? []) as never),
      ...((inc ?? []) as never),
    ];
    edges.push(...all);
    const next: string[] = [];
    for (const e of all) {
      for (const nid of [e.src_id, e.dst_id]) {
        if (!visited.has(nid)) { visited.add(nid); next.push(nid); }
      }
    }
    frontier = next;
  }

  const { data: nodeRows } = await supabase
    .from("memory_files")
    .select("id, type, title, slug")
    .eq("tenant_id", tenantId)
    .in("id", [...visited]);

  return { nodes: nodeRows ?? [], edges };
}
