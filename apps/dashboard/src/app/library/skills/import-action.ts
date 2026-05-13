"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { fetchSkillFromUrl } from "@/lib/skills/import-url";
import { parseSkillMd } from "@/lib/skills/skill-md-parser";
import { scanForInjectionPatterns, type InjectionFlag } from "@/lib/skills/sandbox";

/**
 * Admin-gated server action to import a SKILL.md-BBC skill from a URL.
 *
 * Two-step UX:
 *   - importSkillPreview(url): fetches + parses + scans, returns a preview
 *     (manifest summary, body sha, injection flags). Does NOT write.
 *   - importSkillConfirm(url, acceptInjectionFlags): writes the row.
 *     Caller must pass acceptInjectionFlags=true if the preview surfaced
 *     any flagged spans (AT-PI-1 banner: "I've reviewed this").
 *
 * Security:
 *   - requireRole(actor, "admin") on BOTH actions.
 *   - URL allowlist + size cap + injection scan all happen pre-write.
 *   - body_hash uses sha256 for change detection on re-import.
 */

export type ImportPreviewOk = {
  ok: true;
  manifest: {
    role: string;
    kind: string;
    label: string;
    hint: string;
    citation_contract: string;
    output_kind: string;
    inputs: number;
  };
  bodyHash: string;
  injectionFlags: InjectionFlag[];
  source: { displayUrl: string; repo: string; ref: string; path: string; commit: string };
  skillName: string;
};

export type ImportPreviewErr = {
  ok: false;
  error: string;
  code?: string;
  retryAfterSeconds?: number;
};

export type ImportPreviewResult = ImportPreviewOk | ImportPreviewErr;

export async function importSkillPreview(url: string): Promise<ImportPreviewResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "admin");
  if (!r.ok) return { ok: false, error: r.output };

  const fetched = await fetchSkillFromUrl(url);
  if (!("ok" in fetched)) {
    return {
      ok: false,
      error: fetched.hint,
      code: fetched.code,
      retryAfterSeconds: fetched.retryAfterSeconds,
    };
  }

  const parsed = parseSkillMd(fetched.body);
  if ("code" in parsed) {
    return {
      ok: false,
      error: `${parsed.code}${parsed.field ? ` at ${parsed.field}` : ""}: ${parsed.hint}`,
      code: parsed.code,
    };
  }

  const injectionFlags = scanForInjectionPatterns(parsed.body);
  const bodyHash = sha256(parsed.body_hash_input);

  return {
    ok: true,
    manifest: {
      role: parsed.manifest.role,
      kind: parsed.manifest.kind,
      label: parsed.manifest.label,
      hint: parsed.manifest.hint,
      citation_contract: parsed.manifest.citation_contract,
      output_kind: parsed.manifest.output_kind,
      inputs: parsed.manifest.first_use_inputs.length,
    },
    bodyHash,
    injectionFlags,
    source: {
      displayUrl: fetched.source.displayUrl,
      repo: fetched.source.repo,
      ref: fetched.source.ref,
      path: fetched.source.path,
      commit: fetched.commit,
    },
    skillName: deriveSkillName(fetched.source.path),
  };
}

export type ImportConfirmResult =
  | { ok: true; tenantSkillId: string; skillName: string }
  | { ok: false; error: string; code?: string };

export async function importSkillConfirm(
  url: string,
  acceptInjectionFlags: boolean,
): Promise<ImportConfirmResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "admin");
  if (!r.ok) return { ok: false, error: r.output };

  const fetched = await fetchSkillFromUrl(url);
  if (!("ok" in fetched)) {
    return { ok: false, error: fetched.hint, code: fetched.code };
  }

  const parsed = parseSkillMd(fetched.body);
  if ("code" in parsed) {
    return {
      ok: false,
      error: `${parsed.code}${parsed.field ? ` at ${parsed.field}` : ""}: ${parsed.hint}`,
      code: parsed.code,
    };
  }

  const injectionFlags = scanForInjectionPatterns(parsed.body);
  if (injectionFlags.length > 0 && !acceptInjectionFlags) {
    return {
      ok: false,
      error: `Import flagged for review (${injectionFlags.length} pattern${injectionFlags.length === 1 ? "" : "s"} matched). Re-confirm with acceptInjectionFlags=true after reviewing.`,
      code: "FLAGGED_FOR_REVIEW",
    };
  }

  const skillName = deriveSkillName(fetched.source.path);
  const bodyHash = sha256(parsed.body_hash_input);
  const supabase = await getSupabaseServerClient();

  // Soft-delete any active prior install of this skill in this tenant. The
  // partial-unique index requires uniqueness on (tenant_id, skill_name) where
  // active. Use a transaction-equivalent two-step that's safe because RLS
  // narrows visibility to this tenant only.
  const { error: deactivateErr } = await supabase
    .from("tenant_skills")
    .update({ uninstalled_at: new Date().toISOString() })
    .eq("tenant_id", a.actor.tenant_id)
    .eq("skill_name", skillName)
    .is("uninstalled_at", null);
  if (deactivateErr) {
    return { ok: false, error: `Could not deactivate prior install: ${deactivateErr.message}` };
  }

  const manifestForStorage = {
    bbc: {
      role: parsed.manifest.role,
      kind: parsed.manifest.kind,
      label: parsed.manifest.label,
      hint: parsed.manifest.hint,
      first_use_inputs: parsed.manifest.first_use_inputs,
      retrieval: parsed.manifest.retrieval,
      citation_contract: parsed.manifest.citation_contract,
      output_kind: parsed.manifest.output_kind,
      ...(parsed.manifest.output_schema ? { output_schema: parsed.manifest.output_schema } : {}),
      ...(parsed.manifest.output_lang ? { output_lang: parsed.manifest.output_lang } : {}),
      ...(parsed.manifest.version ? { version: parsed.manifest.version } : {}),
      ...(parsed.manifest.author ? { author: parsed.manifest.author } : {}),
      ...(parsed.manifest.homepage ? { homepage: parsed.manifest.homepage } : {}),
      ...(parsed.manifest.tags ? { tags: parsed.manifest.tags } : {}),
      ...parsed.manifest.unknown,
    },
  };

  const { data, error: insertErr } = await supabase
    .from("tenant_skills")
    .insert({
      tenant_id: a.actor.tenant_id,
      source_kind: "github",
      source_url: fetched.source.displayUrl,
      source_commit: fetched.commit,
      skill_name: skillName,
      skill_role: parsed.manifest.role,
      manifest: manifestForStorage,
      body: parsed.body,
      body_hash: bodyHash,
      installed_by: a.actor.user_id,
    })
    .select("id")
    .single();

  if (insertErr || !data) {
    return { ok: false, error: `Could not save skill: ${insertErr?.message ?? "unknown"}` };
  }

  revalidatePath("/library");

  return { ok: true, tenantSkillId: data.id, skillName };
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function deriveSkillName(path: string): string {
  // path like "marketing/launch.md" → "marketing/launch"
  return path
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9/-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
