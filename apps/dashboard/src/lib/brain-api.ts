import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Brain query API. Tenant-scoped read functions over memory_files plus a few
 * convenience views (decisions, vendors). Used by the MCP server and any
 * future REST shim. Every function takes an explicit tenantId because callers
 * arrive without a Supabase session (Bearer-auth via api_keys, not JWT).
 *
 * SECURITY: the caller MUST have already resolved the token to a tenant_id
 * before calling. These functions use the service-role client and filter by
 * tenant_id explicitly. RLS would catch leakage anyway, but the explicit
 * filter is defense in depth.
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

export type MemorySummary = {
  id: string;
  type: string | null;
  title: string;
  updated_at: string;
};

export type MemoryFull = MemorySummary & {
  fields: Record<string, unknown> | null;
  content: string;
  status: string | null;
  path: string;
  created_at: string;
};

type Client = SupabaseClient<Database>;

function clampLimit(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(raw));
}

export async function listMemories(
  supabase: Client,
  tenantId: string,
  opts: { type?: string; limit?: number } = {},
): Promise<MemorySummary[]> {
  let q = supabase
    .from("memory_files")
    .select("id, type, title, updated_at")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(clampLimit(opts.limit));

  if (opts.type) {
    q = q.eq("type", opts.type as Database["public"]["Enums"]["memory_type"]);
  }

  const { data, error } = await q;
  if (error) throw new Error(`listMemories: ${error.message}`);
  type Row = { id: string; type: string | null; title: string | null; updated_at: string };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    type: r.type,
    title: (r.title ?? "").trim() || "untitled",
    updated_at: r.updated_at,
  }));
}

export async function getMemory(
  supabase: Client,
  tenantId: string,
  memoryId: string,
): Promise<MemoryFull | null> {
  const { data, error } = await supabase
    .from("memory_files")
    .select("id, type, title, fields, content, status, path, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .eq("id", memoryId)
    .maybeSingle();

  if (error) throw new Error(`getMemory: ${error.message}`);
  if (!data) return null;

  type Row = {
    id: string;
    type: string | null;
    title: string | null;
    fields: unknown;
    content: string;
    status: string | null;
    path: string;
    created_at: string;
    updated_at: string;
  };
  const row = data as Row;
  return {
    id: row.id,
    type: row.type,
    title: (row.title ?? "").trim() || "untitled",
    fields: (row.fields ?? null) as Record<string, unknown> | null,
    content: row.content,
    status: row.status,
    path: row.path,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function searchMemories(
  supabase: Client,
  tenantId: string,
  opts: { query: string; limit?: number },
): Promise<MemorySummary[]> {
  const q = (opts.query ?? "").trim();
  if (q.length < 2) return [];

  // ilike with manual escaping -- Postgrest doesn't auto-escape ilike patterns.
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const pattern = `%${escaped}%`;

  const { data, error } = await supabase
    .from("memory_files")
    .select("id, type, title, updated_at")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .or(`title.ilike.${pattern},content.ilike.${pattern}`)
    .order("updated_at", { ascending: false })
    .limit(clampLimit(opts.limit));

  if (error) throw new Error(`searchMemories: ${error.message}`);
  type Row = { id: string; type: string | null; title: string | null; updated_at: string };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    type: r.type,
    title: (r.title ?? "").trim() || "untitled",
    updated_at: r.updated_at,
  }));
}

export async function listDecisions(
  supabase: Client,
  tenantId: string,
  opts: { limit?: number } = {},
): Promise<MemorySummary[]> {
  return listMemories(supabase, tenantId, { type: "decision", limit: opts.limit });
}

export async function listVendors(
  supabase: Client,
  tenantId: string,
): Promise<MemorySummary[]> {
  return listMemories(supabase, tenantId, { type: "vendor", limit: MAX_LIMIT });
}

// --- Queue (proposals) ---

export type ProposalSummary = {
  id: string;
  proposal_id: string;
  status: string;
  proposed_by: string | null;
  target_layer: string | null;
  target_file: string | null;
  change_kind: string | null;
  diff_summary: string | null;
  created_at: string;
};

export type ProposalFull = ProposalSummary & {
  body: string;
  frontmatter: Record<string, unknown>;
  resolved_at: string | null;
  reject_reason: string | null;
};

function fmString(fm: unknown, key: string): string | null {
  if (!fm || typeof fm !== "object") return null;
  const v = (fm as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

export async function listProposals(
  supabase: Client,
  tenantId: string,
  opts: { status?: "pending" | "accepted" | "rejected"; limit?: number } = {},
): Promise<ProposalSummary[]> {
  let q = supabase
    .from("queue_items")
    .select("id, proposal_id, status, frontmatter, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(clampLimit(opts.limit));
  if (opts.status) q = q.eq("status", opts.status);

  const { data, error } = await q;
  if (error) throw new Error(`listProposals: ${error.message}`);
  type Row = {
    id: string;
    proposal_id: string;
    status: string;
    frontmatter: unknown;
    created_at: string;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    proposal_id: r.proposal_id,
    status: r.status,
    proposed_by: fmString(r.frontmatter, "proposed_by"),
    target_layer: fmString(r.frontmatter, "target_layer"),
    target_file: fmString(r.frontmatter, "target_file"),
    change_kind: fmString(r.frontmatter, "change_kind"),
    diff_summary: fmString(r.frontmatter, "diff_summary"),
    created_at: r.created_at,
  }));
}

export async function getProposal(
  supabase: Client,
  tenantId: string,
  proposalId: string,
): Promise<ProposalFull | null> {
  const { data, error } = await supabase
    .from("queue_items")
    .select("id, proposal_id, status, body, frontmatter, resolved_at, reject_reason, created_at")
    .eq("tenant_id", tenantId)
    .eq("proposal_id", proposalId)
    .maybeSingle();

  if (error) throw new Error(`getProposal: ${error.message}`);
  if (!data) return null;
  type Row = {
    id: string;
    proposal_id: string;
    status: string;
    body: string;
    frontmatter: unknown;
    resolved_at: string | null;
    reject_reason: string | null;
    created_at: string;
  };
  const row = data as Row;
  const fm = (row.frontmatter ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    proposal_id: row.proposal_id,
    status: row.status,
    proposed_by: fmString(fm, "proposed_by"),
    target_layer: fmString(fm, "target_layer"),
    target_file: fmString(fm, "target_file"),
    change_kind: fmString(fm, "change_kind"),
    diff_summary: fmString(fm, "diff_summary"),
    body: row.body,
    frontmatter: fm,
    resolved_at: row.resolved_at,
    reject_reason: row.reject_reason,
    created_at: row.created_at,
  };
}

// --- Memory write ---

const KNOWN_MEMORY_TYPES = new Set([
  "decision",
  "voice",
  "glossary",
  "vendor",
  "product",
  "team",
  "skill",
  "source_artifact",
  "note",
]);

export type SubmitMemoryInput = {
  type: string;
  title: string;
  content?: string;
  fields?: Record<string, unknown>;
};

export type SubmitMemoryResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function submitMemory(
  supabase: Client,
  tenantId: string,
  input: SubmitMemoryInput,
): Promise<SubmitMemoryResult> {
  if (!KNOWN_MEMORY_TYPES.has(input.type)) {
    return { ok: false, error: `Unknown memory type: ${input.type}` };
  }
  const title = (input.title ?? "").trim();
  if (!title) return { ok: false, error: "title is required" };
  if (title.length > 200) return { ok: false, error: "title too long (max 200)" };

  const content = input.content ?? "";
  if (content.length > 50_000) {
    return { ok: false, error: "content too long (max 50,000 chars)" };
  }

  // DB-mode path is a unique identifier, not a filesystem path. Synth one
  // so the file-mode origin assumption ("memory/<file>.md") doesn't break.
  const path = `mcp-submitted/${crypto.randomUUID()}.md`;

  const { data, error } = await supabase
    .from("memory_files")
    .insert({
      tenant_id: tenantId,
      type: input.type as Database["public"]["Enums"]["memory_type"],
      title,
      content,
      fields: (input.fields ?? {}) as Database["public"]["Tables"]["memory_files"]["Insert"]["fields"],
      status: "active" as Database["public"]["Enums"]["memory_status"],
      path,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert failed" };
  }
  return { ok: true, id: (data as { id: string }).id };
}
