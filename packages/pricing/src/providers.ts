import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { PricingDeclaration } from "./types.js";

const FRONTMATTER_RE = /^---\n([\s\S]+?)\n---\n([\s\S]*)$/;

export function bbcRepoRoot(override?: string): string {
  if (override) return path.resolve(override);
  if (process.env.BBC_REPO) return path.resolve(process.env.BBC_REPO);
  return path.resolve(process.cwd(), "examples", "example-tenant");
}

type ProviderRecord = {
  provider_slug: string;
  file: string;
  frontmatter: Record<string, unknown>;
  pricing: PricingDeclaration | null;
};

/**
 * Parse a provider markdown file with YAML frontmatter. Returns the parsed
 * frontmatter + the markdown body.
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { frontmatter: {}, body: content };
  const [, fmText, body] = match;
  const frontmatter = parseYaml(fmText ?? "") as Record<string, unknown>;
  return { frontmatter: frontmatter ?? {}, body: body ?? "" };
}

/**
 * Load a single provider record by slug. Looks under
 * `<bbcRepoRoot>/memory/ops/providers/<slug>.yaml` (which is actually a
 * markdown file with YAML frontmatter — yaml extension is historical).
 */
export async function loadProvider(
  slug: string,
  opts: { bbcRepoRoot?: string } = {},
): Promise<ProviderRecord> {
  const root = bbcRepoRoot(opts.bbcRepoRoot);
  const file = path.join(root, "memory", "ops", "providers", `${slug}.yaml`);
  const content = await fs.readFile(file, "utf8");
  const { frontmatter } = parseFrontmatter(content);
  const pricing = (frontmatter.pricing as PricingDeclaration | undefined) ?? null;
  return { provider_slug: slug, file, frontmatter, pricing };
}

/**
 * List every provider yaml under the configured BBC repo root.
 */
export async function listProviders(
  opts: { bbcRepoRoot?: string } = {},
): Promise<ProviderRecord[]> {
  const root = bbcRepoRoot(opts.bbcRepoRoot);
  const dir = path.join(root, "memory", "ops", "providers");
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const records: ProviderRecord[] = [];
  for (const name of files) {
    if (!name.endsWith(".yaml")) continue;
    const slug = name.replace(/\.yaml$/, "");
    try {
      records.push(await loadProvider(slug, opts));
    } catch {
      // Skip unreadable files; the cost calc shouldn't crash on one bad file.
    }
  }
  return records;
}
