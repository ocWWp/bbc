import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The 11 starter memories used by both the /welcome "Try the demo brain"
 * button and the scripts/seed-demo-memories.sh CLI script. Kept here so the
 * two surfaces never drift.
 *
 * These memories are deliberately generic ("Demo Co") so a fresh tenant can
 * exercise Studios + MCP immediately. Users replace them with real records
 * via /welcome (real brain dump) or the memory editor.
 */

type SeedRow = {
  type: Database["public"]["Enums"]["memory_type"];
  title: string;
  content: string;
  fields: Record<string, unknown>;
};

export const DEMO_BRAIN: SeedRow[] = [
  {
    type: "product",
    title: "Demo Co positioning",
    content: "Demo Co is the company brain. We help founders stop re-pasting context into AI tools.",
    fields: {
      positioning: "The company brain. Three loops on one typed memory schema.",
      target_user: "Solo / early-stage founders who waste half a day re-pasting context into AI tools.",
      differentiators: [
        "Typed memory, not vector blob",
        "AGPLv3 self-host",
        "Bring your own API keys",
      ],
    },
  },
  {
    type: "voice",
    title: "Demo Co voice",
    content: "Direct, lowercase, no corporate hedging. Speak to the founder like a peer.",
    fields: {
      register: "direct, lowercase, peer-to-peer",
      do_words: ["plainly", "shipped", "what we decided"],
      dont_words: ["users", "we believe", "leverage", "synergy"],
      example_phrases: ["we shipped it", "the brain is alive", "stop re-pasting"],
    },
  },
  {
    type: "decision",
    title: "Two deployment modes: file + DB",
    content: "Demo Co supports file-mode (single-tenant self-host) and DB-mode (multi-tenant) from one codebase.",
    fields: {
      decision: "Demo Co supports file-mode and DB-mode from one codebase.",
      rationale: "Solo founders want zero infra; hosted demo needs multi-tenant. One schema serves both.",
      consequences: [
        "Stores have two implementations behind one interface",
        "Tenant-scoping via RLS in DB-mode",
      ],
    },
  },
  {
    type: "decision",
    title: "AGPLv3 license, no Stripe in v1",
    content: "Ship AGPLv3, no paywall, no metered SaaS. Self-host or hosted-demo only.",
    fields: {
      decision: "AGPLv3, no Stripe in v1.",
      rationale: "Build the open-source moat first. Commercial license stays a future option.",
      consequences: [
        "Cannot accept revenue in v1",
        "Can sell hosted/enterprise license later",
      ],
    },
  },
  {
    type: "decision",
    title: "Bring-your-own-keys, no central billing",
    content: "Tenants supply their own Anthropic key via /settings/keys, encrypted server-side.",
    fields: {
      decision: "BYOK only; no central LLM billing.",
      rationale: "No metering, no central liability, no surprise bills.",
      consequences: ["Tenants need their own Anthropic account to use LLM features"],
    },
  },
  {
    type: "decision",
    title: "Default deployment target: Cloudflare Workers via OpenNext",
    content: "Ship the Cloudflare deploy button as the primary path; keep Vercel working as fallback.",
    fields: {
      decision: "Cloudflare Workers via OpenNext is the default deploy.",
      rationale: "Cloudflare is cheaper at our volume + the free tier is generous.",
      consequences: ["cf:build / cf:deploy pnpm scripts maintained", "Some Vercel-only features (ISR) avoided"],
    },
  },
  {
    type: "vendor",
    title: "Anthropic",
    content: "Anthropic is the default llm-provider via /bindings.",
    fields: {
      vendor_name: "Anthropic",
      role: "llm-provider",
      status: "active",
      notes: "claude-sonnet-4-6 for run, claude-haiku-4-5 for proposal routing",
    },
  },
  {
    type: "vendor",
    title: "Supabase",
    content: "Supabase is the active db-provider.",
    fields: {
      vendor_name: "Supabase",
      role: "db-provider",
      status: "active",
      notes: "Postgres + Auth + RLS. Free tier covers self-host.",
    },
  },
  {
    type: "vendor",
    title: "Cloudflare",
    content: "Cloudflare hosts the dashboard via the OpenNext Workers adapter.",
    fields: {
      vendor_name: "Cloudflare",
      role: "hosting-provider",
      status: "active",
      notes: "Workers via OpenNext adapter",
    },
  },
  {
    type: "team",
    title: "Demo Founder",
    content: "The founder owns product direction and Demo Co core.",
    fields: {
      name: "Demo Founder",
      role: "founder + engineering",
      responsibilities: "Sets product direction; owns Demo Co core.",
    },
  },
  {
    type: "team",
    title: "Demo Designer",
    content: "The designer owns the visual system and brand voice.",
    fields: {
      name: "Demo Designer",
      role: "design + brand",
      responsibilities: "Visual system, marketing assets, voice consistency.",
    },
  },
];

export async function insertDemoBrain(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<{ ok: true; inserted: number } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const rows = DEMO_BRAIN.map((seed, i) => ({
    tenant_id: tenantId,
    type: seed.type,
    title: seed.title,
    content: seed.content,
    fields: seed.fields as Database["public"]["Tables"]["memory_files"]["Insert"]["fields"],
    status: "active" as Database["public"]["Enums"]["memory_status"],
    path: `demo-brain/${String(i + 1).padStart(2, "0")}-${seed.type}-${crypto.randomUUID().slice(0, 8)}.md`,
    created_at: now,
    updated_at: now,
  }));

  const { data, error } = await supabase
    .from("memory_files")
    .insert(rows)
    .select("id");

  if (error) return { ok: false, error: error.message };
  return { ok: true, inserted: data?.length ?? 0 };
}
