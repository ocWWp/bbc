import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { MemoryType } from "@/lib/api-auth";

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
 *
 * Role filtering: read functions accept an optional `allowedTypes` set. When
 * provided, the query is constrained to that type allowlist (per-role MCP
 * scope, see ROLE_MEMORY_TYPES in api-auth.ts). When omitted, all types are
 * visible (the pre-0031 behavior).
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

type TypeFilter = ReadonlySet<MemoryType> | null | undefined;

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

/**
 * Returns the effective type filter for a query. Precedence:
 *   1. If a caller specifies `opts.type`, only that type is allowed -- but
 *      ONLY if it also passes the role allowlist. If the role disallows it,
 *      the query is forced empty (returns null sentinel meaning "no rows").
 *   2. Otherwise, the role allowlist (if any) is used as the .in() filter.
 *   3. With neither, no type filter is applied.
 */
function effectiveTypeFilter(
  explicitType: string | undefined,
  allowedTypes: TypeFilter,
): { kind: "all" } | { kind: "single"; value: string } | { kind: "in"; values: string[] } | { kind: "empty" } {
  if (explicitType) {
    if (allowedTypes && !allowedTypes.has(explicitType as MemoryType)) {
      return { kind: "empty" };
    }
    return { kind: "single", value: explicitType };
  }
  if (allowedTypes) {
    return { kind: "in", values: Array.from(allowedTypes) };
  }
  return { kind: "all" };
}

export async function listMemories(
  supabase: Client,
  tenantId: string,
  opts: { type?: string; limit?: number; allowedTypes?: TypeFilter } = {},
): Promise<MemorySummary[]> {
  const filter = effectiveTypeFilter(opts.type, opts.allowedTypes);
  if (filter.kind === "empty") return [];

  let q = supabase
    .from("memory_files")
    .select("id, type, title, updated_at")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(clampLimit(opts.limit));

  if (filter.kind === "single") {
    q = q.eq("type", filter.value as Database["public"]["Enums"]["memory_type"]);
  } else if (filter.kind === "in") {
    q = q.in("type", filter.values as Database["public"]["Enums"]["memory_type"][]);
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
  opts: { allowedTypes?: TypeFilter } = {},
): Promise<MemoryFull | null> {
  const { data, error } = await supabase
    .from("memory_files")
    .select("id, type, title, fields, content, status, path, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .eq("id", memoryId)
    .maybeSingle();

  if (error) throw new Error(`getMemory: ${error.message}`);
  if (!data) return null;
  // Role filter: if the row's type isn't in the allowlist, hide it. This
  // matters because get_memory accepts a direct uuid -- without the post-
  // filter a marketing key could fetch an engineering decision by id.
  if (opts.allowedTypes) {
    const rowType = (data as { type: string | null }).type;
    if (rowType && !opts.allowedTypes.has(rowType as MemoryType)) return null;
  }

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
  opts: { query: string; limit?: number; allowedTypes?: TypeFilter },
): Promise<MemorySummary[]> {
  const q = (opts.query ?? "").trim();
  if (q.length < 2) return [];

  // ilike with manual escaping -- Postgrest doesn't auto-escape ilike patterns.
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const pattern = `%${escaped}%`;

  let qb = supabase
    .from("memory_files")
    .select("id, type, title, updated_at")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .or(`title.ilike.${pattern},content.ilike.${pattern}`)
    .order("updated_at", { ascending: false })
    .limit(clampLimit(opts.limit));

  if (opts.allowedTypes) {
    qb = qb.in(
      "type",
      Array.from(opts.allowedTypes) as Database["public"]["Enums"]["memory_type"][],
    );
  }

  const { data, error } = await qb;
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
  opts: { limit?: number; allowedTypes?: TypeFilter } = {},
): Promise<MemorySummary[]> {
  return listMemories(supabase, tenantId, {
    type: "decision",
    limit: opts.limit,
    allowedTypes: opts.allowedTypes,
  });
}

export async function listVendors(
  supabase: Client,
  tenantId: string,
  opts: { allowedTypes?: TypeFilter } = {},
): Promise<MemorySummary[]> {
  return listMemories(supabase, tenantId, {
    type: "vendor",
    limit: MAX_LIMIT,
    allowedTypes: opts.allowedTypes,
  });
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
  opts: { allowedTypes?: TypeFilter } = {},
): Promise<SubmitMemoryResult> {
  if (!KNOWN_MEMORY_TYPES.has(input.type)) {
    return { ok: false, error: `Unknown memory type: ${input.type}` };
  }
  if (opts.allowedTypes && !opts.allowedTypes.has(input.type as MemoryType)) {
    return {
      ok: false,
      error: `Role not permitted to write memory type '${input.type}'.`,
    };
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
