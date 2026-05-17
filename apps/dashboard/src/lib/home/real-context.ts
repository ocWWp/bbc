import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { BuildContextFn } from "@/lib/agent/home-turn";
import {
  voiceFieldsSchema,
  vendorFieldsSchema,
  glossaryFieldsSchema,
} from "@/lib/memory/types";

const INDEX_LIMIT = 40;
const SEARCH_LIMIT = 8;
const MAX_DECISIONS = 8;
const MAX_VENDORS = 10;
const MAX_GLOSSARY = 12;
const MAX_INDEX_CHARS = 2500;

export type HomeMemoryRow = {
  id: string;
  type: string | null;
  title: string | null;
  fields: unknown;
  updated_at: string;
};

export type HomeRetrieval = {
  workspaceName: string;
  rows: HomeMemoryRow[];
};

function safeParse<T>(
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } },
  v: unknown,
): T | undefined {
  const r = schema.safeParse(v);
  return r.success ? r.data : undefined;
}

function buildIndexExcerpt(rows: HomeMemoryRow[]): string {
  const lines: string[] = [];
  for (const r of rows) {
    const title = (r.title ?? "").trim() || "untitled";
    const type = r.type ?? "memory";
    const line = `- ${type}: ${title} [mem:${r.id}]`;
    if (lines.join("\n").length + line.length + 1 > MAX_INDEX_CHARS) break;
    lines.push(line);
  }
  return lines.join("\n");
}

function escapeIlike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Pre-fetch tenant + memory rows the LLM will see this turn. Called once
 * at route level, before homeTurn runs. The IDs become
 * HomeTurnDeps.retrievedMemoryIds (grounding allowlist) and the rows are
 * fed into the buildContext closure (so it stays sync-cheap inside the
 * orchestrator).
 */
export async function retrieveHomeContext(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  userInput: string,
): Promise<HomeRetrieval> {
  const trimmedInput = userInput.trim();
  const [tenantRow, indexRowsRes, searchRowsRes] = await Promise.all([
    supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
    supabase
      .from("memory_files")
      .select("id, type, title, fields, updated_at")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(INDEX_LIMIT),
    trimmedInput.length >= 2
      ? supabase
          .from("memory_files")
          .select("id, type, title, fields, updated_at")
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .or(
            `title.ilike.%${escapeIlike(trimmedInput)}%,content.ilike.%${escapeIlike(trimmedInput)}%`,
          )
          .order("updated_at", { ascending: false })
          .limit(SEARCH_LIMIT)
      : Promise.resolve({ data: [] as HomeMemoryRow[] }),
  ]);

  const workspaceName =
    (tenantRow.data as { name?: string } | null)?.name ?? "Workspace";
  const indexRows = (indexRowsRes.data ?? []) as HomeMemoryRow[];
  const searchRows = (searchRowsRes.data ?? []) as HomeMemoryRow[];

  const byId = new Map<string, HomeMemoryRow>();
  for (const r of [...searchRows, ...indexRows]) {
    if (!byId.has(r.id)) byId.set(r.id, r);
  }
  return { workspaceName, rows: Array.from(byId.values()) };
}

/**
 * Build the BuildContextFn dep from a pre-fetched HomeRetrieval. The
 * returned function is sync-cheap inside the orchestrator — no DB calls.
 */
export function makeBuildContextFromRetrieval(
  retrieval: HomeRetrieval,
): BuildContextFn {
  return async ({ tenantId, actorId, role, userInput, recent }) => {
    const allRows = retrieval.rows;
    const voiceRow = allRows.find((r) => r.type === "voice");
    const voice = voiceRow ? safeParse(voiceFieldsSchema, voiceRow.fields) : undefined;
    const voiceSummary = voice
      ? [
          voice.register ? `register: ${voice.register}` : "",
          voice.do_words.length ? `do: ${voice.do_words.slice(0, 8).join(", ")}` : "",
          voice.dont_words.length ? `don't: ${voice.dont_words.slice(0, 8).join(", ")}` : "",
        ]
          .filter(Boolean)
          .join(" — ")
      : "";

    const vendors = allRows
      .filter((r) => r.type === "vendor")
      .slice(0, MAX_VENDORS)
      .map((r) => {
        const f = safeParse(vendorFieldsSchema, r.fields);
        return (f?.vendor_name ?? r.title ?? "").trim();
      })
      .filter(Boolean);

    const decisions = allRows
      .filter((r) => r.type === "decision")
      .slice(0, MAX_DECISIONS)
      .map((r) => ({
        id: r.id,
        title: (r.title ?? "untitled").trim(),
      }));

    const glossary: Record<string, string> = {};
    let glossaryCount = 0;
    for (const r of allRows) {
      if (r.type !== "glossary") continue;
      if (glossaryCount >= MAX_GLOSSARY) break;
      const f = safeParse(glossaryFieldsSchema, r.fields);
      const term = (f?.term ?? r.title ?? "").trim();
      const def = (f?.definition ?? "").trim();
      if (!term || !def) continue;
      glossary[term] = def;
      glossaryCount++;
    }

    return {
      tenantId,
      actorId,
      role,
      rolePack: { voice: voiceSummary, vendors, decisions, glossary },
      buffer: { kind: "conversation", turns: recent, userInput },
      alwaysOn: {
        memoryIndexExcerpt: buildIndexExcerpt(allRows),
        workspaceName: retrieval.workspaceName,
      },
    };
  };
}

export function retrievedMemoryIdsOf(retrieval: HomeRetrieval): string[] {
  return retrieval.rows.map((r) => r.id);
}
