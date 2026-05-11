"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  proposalsResponseSchema,
  type Proposal,
} from "@/lib/memory/extractor/types";
import { EXTRACT_PROPOSALS_TOOL, SYSTEM_PROMPT } from "@/lib/memory/extractor/prompt";
import { supertagSchemas, type Supertag } from "@/lib/memory/types";

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

export async function extractMemoryProposals(text: string): Promise<ExtractResult> {
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Server missing ANTHROPIC_API_KEY. Ask your admin." };
  }

  const client = new Anthropic({ apiKey });

  let resp;
  try {
    resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [EXTRACT_PROPOSALS_TOOL],
      tool_choice: { type: "tool", name: EXTRACT_PROPOSALS_TOOL.name },
      messages: [{ role: "user", content: truncated }],
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

export async function bulkAcceptProposals(proposals: Proposal[]): Promise<BulkAcceptResult> {
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

  revalidatePath("/memory");
  return { ok: true, created: data?.length ?? 0, firstId: data?.[0]?.id ?? null };
}
