#!/usr/bin/env tsx
/**
 * Phase H seed: migrate examples/example-tenant/memory/** into typed memory_files rows.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SEED_TENANT_ID=<uuid> \
 *     pnpm --filter @bbc/dashboard exec tsx scripts/seed-example-tenant.ts
 *
 * Idempotent via (tenant_id, type, slug) unique constraint.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import matter from "gray-matter";
import { createClient } from "@supabase/supabase-js";
import {
  supertagSchemas,
  type Supertag,
  type DecisionFields,
  type VendorFields,
  type TeamFields,
  type GlossaryFields,
} from "../src/lib/memory/types";

const ROOT = resolve(__dirname, "../../../examples/example-tenant/memory");
const TENANT_ID = process.env.SEED_TENANT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TENANT_ID || !SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Required env: SEED_TENANT_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function classify(relPath: string): Supertag | null {
  if (relPath.startsWith("design/voice"))                            return "voice";
  if (relPath.startsWith("decisions/"))                              return "decision";
  if (relPath.startsWith("glossary/"))                               return "glossary";
  if (relPath.startsWith("ops/vendors") || relPath.startsWith("ops/providers/"))
                                                                      return "vendor";
  if (relPath.startsWith("people/"))                                 return "team";
  if (relPath.startsWith("skills/"))                                 return "skill";
  if (relPath.startsWith("product/"))                                return "product";
  return null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.(md|yaml|yml)$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeFields(type: Supertag, fm: Record<string, unknown>, content: string): unknown {
  switch (type) {
    case "decision": {
      const f: Partial<DecisionFields> = {
        status: (fm.status as DecisionFields["status"]) ?? "proposed",
        date: typeof fm.date === "string" ? fm.date : undefined,
        context: typeof fm.context === "string" ? fm.context : "",
        decision: typeof fm.decision === "string" ? fm.decision : "",
        consequences: typeof fm.consequences === "string" ? fm.consequences : "",
      };
      if (typeof fm.number === "number") f.number = fm.number;
      return f;
    }
    case "vendor": {
      const f: Partial<VendorFields> = {
        vendor_name: (fm.name as string) ?? (fm.vendor_name as string) ?? "",
        role: (fm.role as string) ?? "",
        status: (fm.status as VendorFields["status"]) ?? "candidate",
      };
      if (typeof fm.homepage === "string") f.homepage = fm.homepage;
      if (typeof fm.pricing_url === "string") f.pricing_url = fm.pricing_url;
      if (typeof fm.notes === "string") f.notes = fm.notes;
      return f;
    }
    case "team": {
      const f: Partial<TeamFields> = {
        name: (fm.name as string) ?? "",
        role: (fm.role as string) ?? "",
      };
      if (typeof fm.email === "string") f.email = fm.email;
      if (typeof fm.bio === "string") f.bio = fm.bio;
      return f;
    }
    case "glossary": {
      const f: Partial<GlossaryFields> = {
        term: (fm.term as string) ?? "",
        definition: typeof fm.definition === "string" ? fm.definition : content.slice(0, 1000),
      };
      if (Array.isArray(fm.aliases)) f.aliases = fm.aliases as string[];
      return f;
    }
    default:
      return fm;
  }
}

async function main() {
  const files = walk(ROOT).filter((f) => /\.(md|yaml|yml)$/i.test(f));
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const rel = relative(ROOT, file);
    if (rel === "_schema.md") { skipped++; continue; }

    const type = classify(rel);
    if (!type) {
      console.warn(`skip (no classifier): ${rel}`);
      skipped++;
      continue;
    }

    const raw = readFileSync(file, "utf8");
    const isMd = file.endsWith(".md");
    const parsed = isMd ? matter(raw) : { data: {}, content: raw };
    const fm = parsed.data as Record<string, unknown>;
    const content = parsed.content;

    const baseName = rel.split("/").pop() ?? rel;
    const slug = slugify(baseName);
    const title =
      (typeof fm.title === "string" && fm.title) ||
      (typeof fm.name === "string" && fm.name) ||
      slug.replace(/-/g, " ");

    const rawFields = normalizeFields(type, fm, content);
    const validation = supertagSchemas[type].safeParse(rawFields);
    if (!validation.success) {
      console.warn(`zod fail ${type}/${slug}: ${validation.error.issues[0]?.message}`);
      failed++;
      continue;
    }

    const body_blocks = content
      ? [{ type: "paragraph", content: [{ type: "text", text: content.slice(0, 2000), styles: {} }] }]
      : [];

    const { error } = await supabase
      .from("memory_files")
      .upsert(
        {
          tenant_id: TENANT_ID,
          type,
          title,
          slug,
          status: "active",
          fields: validation.data,
          body_blocks,
          path: `memory/${rel}`,
          content,
          frontmatter: fm,
        },
        { onConflict: "tenant_id,type,slug" },
      );

    if (error) {
      console.error(`upsert fail ${type}/${slug}: ${error.message}`);
      failed++;
    } else {
      console.log(`✓ ${type}/${slug}`);
      imported++;
    }
  }

  console.log(`\n--- imported=${imported} skipped=${skipped} failed=${failed} ---`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
