import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkillItem, SkillRole, Supertag } from "@/app/library/_data";

/**
 * Read tenant_skills rows for the current tenant and map them into the
 * SkillItem shape the Library UI already consumes.
 *
 * For v1.5: imported skills come from tenant_skills (source_kind in
 * 'github' | 'manual'). The 5 built-in studio role agents remain hard-coded
 * in apps/dashboard/src/app/library/_data.ts; the launch plan calls them
 * "built-ins surfaced as synthetic rows" but the catalog already provides
 * that visual surface today. This reader is purely additive.
 *
 * RLS narrows the SELECT to the caller's tenant via the supabase client;
 * we don't filter by tenant_id explicitly to avoid drift.
 */

type RawSkillRow = {
  id: string;
  skill_name: string;
  skill_role: string;
  manifest: Record<string, unknown> | null;
  source_kind: string;
  source_url: string | null;
  source_commit: string | null;
  installed_at: string;
};

type StoredManifest = {
  bbc?: {
    label?: string;
    hint?: string;
    citation_contract?: string;
    output_kind?: string;
    retrieval?: {
      required_types?: unknown;
      contextual_types?: { types?: unknown };
    };
    author?: string;
    version?: string;
    tags?: string[];
  };
};

const KNOWN_ROLES: ReadonlyArray<SkillRole> = [
  "marketing",
  "engineering",
  "founder",
  "designer",
  "support",
  "sales",
  "ops",
  "meta",
];

const KNOWN_SUPERTAGS: ReadonlyArray<Supertag> = [
  "voice",
  "decision",
  "vendor",
  "team",
  "product",
  "glossary",
  "skill",
  "source_artifact",
  "note",
];

export async function readTenantSkills(supabase: SupabaseClient): Promise<SkillItem[]> {
  const { data, error } = await supabase
    .from("tenant_skills")
    .select("id, skill_name, skill_role, manifest, source_kind, source_url, source_commit, installed_at")
    .is("uninstalled_at", null)
    .order("installed_at", { ascending: false });

  if (error || !data) return [];

  return (data as RawSkillRow[]).map(rowToSkillItem).filter((s): s is SkillItem => s !== null);
}

function rowToSkillItem(row: RawSkillRow): SkillItem | null {
  if (!isKnownRole(row.skill_role)) return null;

  const manifest = (row.manifest ?? {}) as StoredManifest;
  const bbc = manifest.bbc ?? {};
  const reads = toSupertagArray(bbc.retrieval?.required_types);
  const contextualTypes = toSupertagArray(bbc.retrieval?.contextual_types?.types);
  const allReads = Array.from(new Set([...reads, ...contextualTypes]));

  const author = bbc.author ?? (row.source_kind === "github" ? extractGithubAuthor(row.source_url) : "BBC");

  return {
    id: row.id,
    kind: "skill",
    role: row.skill_role,
    name: bbc.label ?? row.skill_name,
    author,
    desc: bbc.hint ?? "Imported skill.",
    reads: allReads,
    writes: [],
    installed: true,
    recommended: false,
    badge: null,
    stars: 0,
    updated: row.installed_at.slice(0, 10),
    license: row.source_kind === "github" ? "external" : "tenant",
    repo: row.source_url ?? row.source_kind,
    glyph: row.skill_role.slice(0, 1).toUpperCase(),
  };
}

function isKnownRole(s: string): s is SkillRole {
  return (KNOWN_ROLES as readonly string[]).includes(s);
}

function toSupertagArray(v: unknown): Supertag[] {
  if (!Array.isArray(v)) return [];
  const out: Supertag[] = [];
  for (const item of v) {
    if (typeof item === "string" && (KNOWN_SUPERTAGS as readonly string[]).includes(item)) {
      out.push(item as Supertag);
    }
  }
  return out;
}

function extractGithubAuthor(sourceUrl: string | null): string {
  if (!sourceUrl) return "github";
  try {
    const u = new URL(sourceUrl);
    if (u.hostname === "github.com" || u.hostname === "raw.githubusercontent.com") {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0]) return `@${parts[0]}`;
    }
  } catch {
    /* fall through */
  }
  return "github";
}
