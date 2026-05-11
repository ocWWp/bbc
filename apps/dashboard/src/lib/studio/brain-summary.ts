// Marketing Studio brain-summary builder. Reads memory_files for the active
// tenant and condenses them into the BrainSummary shape that templates consume.
// Deterministic SQL, no LLM call -- so the same tenant always gets the same
// summary on the same data. Capped per-type so a large brain can't blow the
// prompt token budget.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { BrainSummary } from "./templates/types";
import {
  voiceFieldsSchema,
  productFieldsSchema,
  decisionFieldsSchema,
  vendorFieldsSchema,
  teamFieldsSchema,
} from "@/lib/memory/types";

const MAX_DECISIONS = 5;
const MAX_VENDORS = 8;
const MAX_TEAM = 8;

type MemRow = {
  id: string;
  type: string | null;
  title: string | null;
  fields: unknown;
  updated_at: string;
};

export async function loadBrainSummary(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<BrainSummary> {
  const { data } = await supabase
    .from("memory_files")
    .select("id, type, title, fields, updated_at")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(200);

  const rows: MemRow[] = data ?? [];
  const byType = (t: string) => rows.filter((r) => r.type === t);

  const voiceRow = byType("voice")[0];
  const productRow = byType("product")[0];

  const voice = voiceRow ? safeParse(voiceFieldsSchema, voiceRow.fields) : undefined;
  const product = productRow ? safeParse(productFieldsSchema, productRow.fields) : undefined;

  const decisions = byType("decision")
    .slice(0, MAX_DECISIONS)
    .map((r) => {
      const f = safeParse(decisionFieldsSchema, r.fields);
      return {
        id: r.id,
        title: (r.title ?? "").slice(0, 120),
        decision: (f?.decision ?? "").slice(0, 300),
      };
    });

  const vendors = byType("vendor")
    .slice(0, MAX_VENDORS)
    .map((r) => {
      const f = safeParse(vendorFieldsSchema, r.fields);
      return {
        id: r.id,
        name: (f?.vendor_name ?? r.title ?? "").slice(0, 100),
        role: (f?.role ?? "").slice(0, 100),
      };
    })
    .filter((v) => v.name);

  const team = byType("team")
    .slice(0, MAX_TEAM)
    .map((r) => {
      const f = safeParse(teamFieldsSchema, r.fields);
      return {
        id: r.id,
        name: (f?.name ?? r.title ?? "").slice(0, 100),
        role: (f?.role ?? "").slice(0, 100),
      };
    })
    .filter((m) => m.name);

  return {
    voice: voice
      ? {
          register: voice.register,
          do_words: voice.do_words.slice(0, 12),
          dont_words: voice.dont_words.slice(0, 12),
          example_phrases: voice.example_phrases.slice(0, 5),
        }
      : undefined,
    product: product
      ? {
          positioning: product.positioning.slice(0, 400),
          target_user: product.target_user.slice(0, 300),
          differentiators: product.differentiators.slice(0, 6),
        }
      : undefined,
    recent_decisions: decisions,
    vendors,
    team,
  };
}

// Returns the set of memory_file ids belonging to the tenant. Used by
// runWorkflow to validate LLM-emitted citations -- anything not in this set
// gets stripped before the row lands in studio_runs.
export async function loadTenantMemoryIds(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("memory_files")
    .select("id")
    .eq("tenant_id", tenantId);
  return new Set((data ?? []).map((r) => r.id));
}

function safeParse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, v: unknown): T | undefined {
  const r = schema.safeParse(v);
  return r.success ? r.data : undefined;
}
