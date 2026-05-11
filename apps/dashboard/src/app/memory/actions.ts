"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { supertagSchemas, type Supertag } from "@/lib/memory/types";
import type { Database } from "@/lib/supabase/database.types";

type RelationKind = Database["public"]["Enums"]["memory_relation_kind"];
type StatusEnum = Database["public"]["Enums"]["memory_status"];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `item-${Date.now()}`;
}

export async function createBlankItem(type: Supertag): Promise<void> {
  const a = await requireActor();
  if (!a.ok) throw new Error(a.output);
  const r = requireRole(a.actor, "member");
  if (!r.ok) throw new Error(r.output);

  const schema = supertagSchemas[type];
  const defaultFields = schema.parse({});
  const ts = Date.now();
  const slug = `untitled-${ts}`;

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("memory_files")
    .insert({
      tenant_id: a.actor.tenant_id,
      type,
      title: "Untitled",
      slug,
      status: "draft",
      fields: defaultFields,
      body_blocks: [],
      path: `memory/${type}/${slug}.md`,
      content: "",
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/memory");
  redirect(`/memory/${data.id}`);
}

export type UpdatePatch = {
  title?: string;
  fields?: unknown;
  body_blocks?: unknown;
  status?: StatusEnum;
  slug?: string;
};

export async function updateMemoryItem(id: string, patch: UpdatePatch): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };

  const supabase = await getSupabaseServerClient();

  if (patch.fields !== undefined) {
    const { data: row } = await supabase
      .from("memory_files")
      .select("type")
      .eq("tenant_id", a.actor.tenant_id)
      .eq("id", id)
      .single();
    if (row?.type) {
      const result = supertagSchemas[row.type as Supertag].safeParse(patch.fields);
      if (!result.success) {
        return { ok: false, error: result.error.issues.map((i) => i.message).join("; ") };
      }
      patch.fields = result.data;
    }
  }

  if (patch.title) {
    patch.slug = patch.slug ?? slugify(patch.title);
  }

  const { error } = await supabase
    .from("memory_files")
    .update({ ...(patch as object), updated_at: new Date().toISOString() })
    .eq("tenant_id", a.actor.tenant_id)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/memory/${id}`);
  revalidatePath("/memory");
  return { ok: true };
}

export async function archiveMemoryItem(id: string): Promise<void> {
  const a = await requireActor();
  if (!a.ok) throw new Error(a.output);
  const r = requireRole(a.actor, "member");
  if (!r.ok) throw new Error(r.output);

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("memory_files")
    .update({ status: "archived" })
    .eq("tenant_id", a.actor.tenant_id)
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/memory");
}

export async function publishMemoryItem(id: string): Promise<void> {
  const a = await requireActor();
  if (!a.ok) throw new Error(a.output);
  const r = requireRole(a.actor, "member");
  if (!r.ok) throw new Error(r.output);

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("memory_files")
    .update({ status: "active" })
    .eq("tenant_id", a.actor.tenant_id)
    .eq("id", id);
  if (error) throw error;
  revalidatePath(`/memory/${id}`);
  revalidatePath("/memory");
}

export async function createRelation(src_id: string, dst_id: string, kind: RelationKind): Promise<{ ok: boolean; error?: string }> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };

  if (src_id === dst_id) return { ok: false, error: "Cannot relate item to itself" };

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("memory_relations")
    .insert({ src_id, dst_id, kind, tenant_id: a.actor.tenant_id, created_by: a.actor.user_id });
  if (error && !error.message.toLowerCase().includes("duplicate")) {
    return { ok: false, error: error.message };
  }
  revalidatePath(`/memory/${src_id}`);
  revalidatePath(`/memory/${dst_id}`);
  return { ok: true };
}

export async function deleteRelation(id: string): Promise<{ ok: boolean; error?: string }> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("memory_relations")
    .delete()
    .eq("tenant_id", a.actor.tenant_id)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
