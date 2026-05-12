"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/secrets/anthropic-client";
import {
  proposalsResponseSchema,
  type Proposal,
} from "@/lib/memory/extractor/types";
import { EXTRACT_PROPOSALS_TOOL, SYSTEM_PROMPT } from "@/lib/memory/extractor/prompt";
import { supertagSchemas, type Supertag } from "@/lib/memory/types";
import "@/lib/ingestion"; // registers text/url/file adapters on the shared registry
import { getAdapter, type IngestionSourceKind } from "@/lib/ingestion/adapter";
import { insertDemoBrain } from "@/lib/welcome/demo-brain";

// PII pre-scrub: strip the most common high-severity leaks before the raw text
// reaches the LLM extractor or the database. Patterns are intentionally tight to
// avoid false positives -- this is a coarse net, not a comprehensive DLP.
const PII_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "openai_key", re: /\bsk-(?:proj-)?[a-zA-Z0-9_-]{40,}\b/g },
  { name: "anthropic_key", re: /\bsk-ant-[a-zA-Z0-9_-]{40,}\b/g },
  { name: "aws_access_key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "github_pat", re: /\bghp_[a-zA-Z0-9]{36}\b/g },
  { name: "url_password", re: /\b(https?:\/\/[^:@\s]+):([^@\s]+)@/g },
];

function scrubPII(text: string): { scrubbed: string; redactions: Record<string, number> } {
  const redactions: Record<string, number> = {};
  let out = text;
  for (const { name, re } of PII_PATTERNS) {
    out = out.replace(re, (_match, ...groups) => {
      redactions[name] = (redactions[name] ?? 0) + 1;
      // url_password keeps the URL prefix so the link still parses; only the secret dies.
      if (name === "url_password" && typeof groups[0] === "string") {
        return `${groups[0]}:[REDACTED]@`;
      }
      return `[REDACTED:${name}]`;
    });
  }
  return { scrubbed: out, redactions };
}

const MODEL = "claude-sonnet-4-6";
const MAX_INPUT_CHARS = 8000;
const MIN_INPUT_CHARS = 80;

const rateLimits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const window = 60_000;
  const max = 5;
  const arr = (rateLimits.get(userId) ?? []).filter((t) => now - t < window);
  if (arr.length >= max) {
    rateLimits.set(userId, arr);
    return true;
  }
  arr.push(now);
  rateLimits.set(userId, arr);
  return false;
}

export type ExtractResult =
  | { ok: true; proposals: Proposal[] }
  | { ok: false; error: string };

export type SourceContext = {
  sourceId?: string;
  kind?: "text" | "url" | "file";
  locator?: Record<string, unknown>;
};

function sourceTag(ctx: SourceContext | undefined): string {
  if (!ctx?.kind) return "";
  const loc = ctx.locator ?? {};
  const where =
    ctx.kind === "url" && typeof loc.href === "string" ? loc.href :
    ctx.kind === "file" && typeof loc.filename === "string" ? loc.filename :
    "";
  return `<source channel="${ctx.kind}"${where ? ` location="${where.replace(/"/g, "&quot;")}"` : ""} />\n\n`;
}

export async function extractMemoryProposals(
  text: string,
  source?: SourceContext,
): Promise<ExtractResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: "unauthorized" };

  if (rateLimited(a.actor.user_id)) {
    return { ok: false, error: "Too many extractions — wait a moment and try again." };
  }

  const trimmed = text.trim();
  if (trimmed.length < MIN_INPUT_CHARS) {
    return { ok: false, error: `Add a bit more — at least ${MIN_INPUT_CHARS} characters.` };
  }
  const truncated = trimmed.length > MAX_INPUT_CHARS ? trimmed.slice(0, MAX_INPUT_CHARS) : trimmed;
  const taggedInput = sourceTag(source) + truncated;

  const supabaseForClient = await getSupabaseServerClient();
  const clientRes = await getAnthropicClient(supabaseForClient, a.actor.tenant_id);
  if (!clientRes.ok) return { ok: false, error: clientRes.error };
  const { client, costAttribution } = clientRes;
  console.info(
    `welcome.extract: tenant=${a.actor.tenant_id} cost=${costAttribution}`,
  );

  let resp;
  try {
    resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [EXTRACT_PROPOSALS_TOOL],
      tool_choice: { type: "tool", name: EXTRACT_PROPOSALS_TOOL.name },
      messages: [{ role: "user", content: taggedInput }],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    return { ok: false, error: `Extractor failed: ${message}` };
  }

  const toolUse = resp.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return { ok: false, error: "Extractor returned no structured output." };
  }

  const parsed = proposalsResponseSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Extractor returned invalid shape: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    };
  }

  return { ok: true, proposals: parsed.data.proposals };
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || `item-${Date.now()}`
  );
}

export type BulkAcceptResult =
  | { ok: true; created: number; firstId: string | null }
  | { ok: false; error: string };

export async function bulkAcceptProposals(
  proposals: Proposal[],
  sourceId?: string,
): Promise<BulkAcceptResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };

  if (proposals.length === 0) return { ok: false, error: "Nothing to accept." };
  if (proposals.length > 50) return { ok: false, error: "Too many at once — cap is 50." };

  const supabase = await getSupabaseServerClient();
  const tenantId = a.actor.tenant_id;
  const ts = Date.now();

  const rows = proposals
    .map((p, i) => {
      const schema = supertagSchemas[p.type as Supertag];
      const fieldsResult = schema.safeParse(p.fields ?? {});
      if (!fieldsResult.success) return null;
      const slug = `${slugify(p.title)}-${ts}-${i}`;
      const body = (p.body ?? "").trim();
      return {
        tenant_id: tenantId,
        type: p.type,
        title: p.title,
        slug,
        status: "active" as const,
        fields: fieldsResult.data,
        body_blocks: body
          ? [{ type: "paragraph", content: [{ type: "text", text: body, styles: {} }] }]
          : [],
        path: `memory/${p.type}/${slug}.md`,
        content: body,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) return { ok: false, error: "No proposals passed validation." };

  const { data, error } = await supabase
    .from("memory_files")
    .insert(rows)
    .select("id")
    .order("id", { ascending: true });

  if (error) return { ok: false, error: error.message };

  // Phase I.20: link every accepted memory back to the source that spawned it.
  // Best-effort -- a failure here doesn't reject the memories, just leaves them
  // unattributed (matches the pre-I.20 path where memories had no provenance).
  if (sourceId && data && data.length > 0) {
    const joinRows = data.map((m: { id: string }) => ({
      memory_id: m.id,
      source_id: sourceId,
      tenant_id: tenantId,
    }));
    const { error: joinErr } = await supabase.from("memory_file_sources").insert(joinRows);
    if (joinErr) {
      console.warn(`memory_file_sources insert failed: ${joinErr.message}`);
    } else {
      await supabase
        .from("ingestion_sources")
        .update({ status: "integrated" })
        .eq("id", sourceId)
        .eq("tenant_id", tenantId);
    }
  }

  revalidatePath("/memory");
  return { ok: true, created: data?.length ?? 0, firstId: data?.[0]?.id ?? null };
}

// ----------------------------------------------------------------------------
// Phase I.20: ingestSource -- runs the adapter for one source (text/url/file),
// scrubs PII, and inserts an ingestion_sources row. Returns the source_id and
// the scrubbed raw text so the caller can hand it to extractMemoryProposals.
// Idempotent: re-ingesting the same content (same kind + content_hash) returns
// the existing source_id rather than creating a duplicate row.
// ----------------------------------------------------------------------------

export type IngestSourceInput =
  | { kind: "text"; text: string }
  | { kind: "url"; url: string }
  | { kind: "file"; name: string; bytes: Uint8Array };

export type IngestResult =
  | {
      ok: true;
      sourceId: string;
      kind: IngestionSourceKind;
      rawText: string;
      locator: Record<string, unknown>;
      redactions: Record<string, number>;
      reused: boolean;
    }
  | { ok: false; error: string };

export async function ingestSource(input: IngestSourceInput): Promise<IngestResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: "unauthorized" };

  if (rateLimited(a.actor.user_id)) {
    return { ok: false, error: "Too many ingestions — wait a moment." };
  }

  const adapter = getAdapter(input.kind);
  if (!adapter) return { ok: false, error: `Unknown source kind: ${input.kind}` };

  const result = await adapter.ingest(input);
  if (!result.ok) return { ok: false, error: result.error };

  const { scrubbed, redactions } = scrubPII(result.rawText);
  const idempotency_key = `${input.kind}:${result.contentHash}`;
  const supabase = await getSupabaseServerClient();
  const tenantId = a.actor.tenant_id;

  // Check for an existing source first (RLS-gated read). If found, reuse it --
  // the user pasting the same URL twice should not log a second row.
  const { data: existing } = await supabase
    .from("ingestion_sources")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("idempotency_key", idempotency_key)
    .maybeSingle();

  if (existing?.id) {
    return {
      ok: true,
      sourceId: existing.id,
      kind: input.kind,
      rawText: scrubbed,
      locator: result.locator,
      redactions,
      reused: true,
    };
  }

  const locatorWithRedactions = {
    ...result.locator,
    ...(Object.keys(redactions).length > 0 ? { redactions } : {}),
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("ingestion_sources")
    .insert({
      tenant_id: tenantId,
      created_by: a.actor.user_id,
      kind: input.kind,
      status: "extracted",
      idempotency_key,
      locator: locatorWithRedactions,
      content_hash: result.contentHash,
      byte_size: result.byteSize,
      fetched_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr) {
    return { ok: false, error: `Could not record source: ${insertErr.message}` };
  }
  if (!inserted?.id) {
    return { ok: false, error: "Source insert returned no id." };
  }

  return {
    ok: true,
    sourceId: inserted.id,
    kind: input.kind,
    rawText: scrubbed,
    locator: result.locator,
    redactions,
    reused: false,
  };
}

// ----------------------------------------------------------------------------
// Demo brain seed -- the "Try the demo brain" button on /welcome.
// Inserts 11 starter memories (product, voice, decisions, vendors, team) so
// a fresh tenant can exercise Studios + MCP without going through the
// brain-dump flow. Same content as scripts/seed-demo-memories.sh; both call
// into lib/welcome/demo-brain.ts to avoid drift.
// ----------------------------------------------------------------------------

export type SeedDemoBrainResult =
  | { ok: true; inserted: number }
  | { ok: false; error: string };

export async function seedDemoBrain(): Promise<SeedDemoBrainResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };

  const supabase = await getSupabaseServerClient();

  // Idempotency: don't re-seed if the tenant already has memories. The button
  // is gated by the same check on the client, but enforce server-side too.
  const { count } = await supabase
    .from("memory_files")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", a.actor.tenant_id);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error:
        "Demo brain seed only runs into an empty tenant. Your brain already has memories.",
    };
  }

  const result = await insertDemoBrain(supabase, a.actor.tenant_id);
  if (!result.ok) return result;

  revalidatePath("/memory");
  revalidatePath("/welcome");
  return result;
}
