import fs from "node:fs/promises";
import path from "node:path";
import { bbcRepoRoot } from "./bbc-paths";
import { parseFrontmatter, fmString } from "./frontmatter";

export type LeafAgent = {
  name: string;
  description: string;
  model?: string;
  rel_path: string;
};

export type LeafSkill = {
  name: string;
  source: string;
  source_type?: string;
  /** Description from BBC's library at memory/ops/external-skills/<name>.yaml; undefined if no record exists. */
  description?: string;
  /** True iff the BBC library has a record for this skill (per skill-description-required rule). */
  recorded: boolean;
};

export type LeafResources = {
  leaf: string;
  shadowed_repo_path?: string;
  shadowed_repo_present: boolean;
  agents: LeafAgent[];
  pinned_skills: LeafSkill[];
};

/**
 * Pull an absolute filesystem path from a leaf's CLAUDE.md. Each real leaf
 * has a code block naming the repo it shadows.
 */
function extractShadowedPath(leafClaudeMd: string): string | undefined {
  const m = leafClaudeMd.match(/```\s*\n(\/[^\n]+)\n```/);
  if (m && m[1].trim()) return m[1].trim();
  // Fallback: any /Users/... or /home/... line in the file
  const m2 = leafClaudeMd.match(/(\/(?:Users|home)\/[\w./-]+)/);
  return m2?.[1];
}

async function readAgents(repoRoot: string): Promise<LeafAgent[]> {
  const dir = path.join(repoRoot, ".claude", "agents");
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: LeafAgent[] = [];
  for (const f of files.filter((x) => x.endsWith(".md")).sort()) {
    const full = path.join(dir, f);
    let text: string;
    try {
      text = await fs.readFile(full, "utf8");
    } catch {
      continue;
    }
    const { fm, body } = parseFrontmatter(text);
    const name = fmString(fm, "name") ?? path.basename(f, ".md");
    // Some frontmatter descriptions embed multi-line <example> blocks with
    // literal \n escapes. Sanitize aggressively and take only the first sentence.
    const rawDesc = fmString(fm, "description") ?? "";
    const description = condenseDescription(rawDesc) || condenseDescription(firstSentence(body) ?? "") || "(no description)";
    const model = fmString(fm, "model");
    out.push({ name, description, model, rel_path: path.relative(repoRoot, full) });
  }
  return out;
}

/**
 * Sanitize and truncate a description. Strips literal \n escapes, HTML/XML-like
 * tags, collapses whitespace, takes the first sentence (or the first 200 chars
 * if no sentence boundary exists), and appends an ellipsis if truncated.
 */
function condenseDescription(raw: string): string {
  if (!raw) return "";
  let s = raw;
  // Unescape literal \\n and \n appearing in the stringified frontmatter
  s = s.replace(/\\\\n|\\n/g, " ");
  // Drop XML/HTML-like tags wholesale (e.g. <example>...</example>, <commentary>...)
  s = s.replace(/<[^>]+>/g, " ");
  // Drop common escape artifacts
  s = s.replace(/\\"/g, '"').replace(/\\'/g, "'");
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";
  // First sentence
  const m = s.match(/^([^.!?]+[.!?])(?:\s|$)/);
  let cut = m ? m[1].trim() : s;
  // Hard cap: 200 chars
  if (cut.length > 200) cut = cut.slice(0, 200).trimEnd() + "…";
  return cut;
}

async function readSkillsLock(repoRoot: string, library: ExternalLibrary): Promise<LeafSkill[]> {
  const file = path.join(repoRoot, "skills-lock.json");
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return [];
  }
  let data: { skills?: Record<string, { source?: string; sourceType?: string }> };
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!data.skills) return [];
  return Object.entries(data.skills)
    .map(([name, v]) => {
      const record = library.get(name);
      return {
        name,
        source: v?.source ?? record?.source ?? "(unknown)",
        source_type: v?.sourceType ?? record?.source_type,
        description: record?.description,
        recorded: !!record,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * BBC's external-skills library. Per `manager/rules/skill-description-required.md`,
 * any pinned external skill should have a Main-owned record at
 * memory/ops/external-skills/<name>.yaml. The dashboard surfaces those descriptions
 * here; missing records show a warning pill on the page.
 */
type ExternalRecord = { description: string; source?: string; source_type?: string };
type ExternalLibrary = Map<string, ExternalRecord>;

async function readExternalLibrary(): Promise<ExternalLibrary> {
  const root = bbcRepoRoot();
  const dir = path.join(root, "memory", "ops", "external-skills");
  const out: ExternalLibrary = new Map();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return out;
  }
  for (const f of entries.filter((e) => e.endsWith(".yaml"))) {
    let text: string;
    try {
      text = await fs.readFile(path.join(dir, f), "utf8");
    } catch {
      continue;
    }
    const { fm } = parseFrontmatter(text);
    const id = fmString(fm, "external_skill_id");
    const description = fmString(fm, "description");
    if (id && description) {
      out.set(id, {
        description,
        source: fmString(fm, "source"),
        source_type: fmString(fm, "source_type"),
      });
    }
  }
  return out;
}

function firstSentence(text: string): string | undefined {
  const lines = text.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(">") || line.startsWith("-")) continue;
    if (line.startsWith("```")) continue;
    const m = line.match(/^([^.!?]+[.!?])(?:\s|$)/);
    if (m) return m[1].trim();
    return line.length > 140 ? line.slice(0, 140) + "…" : line;
  }
  return undefined;
}

/** List BBC leaves and probe each for repo-local agents + pinned skills. */
export async function listLeafResources(): Promise<LeafResources[]> {
  const root = bbcRepoRoot();
  const distDir = path.join(root, "distribution");
  let entries: string[];
  try {
    entries = await fs.readdir(distDir);
  } catch {
    return [];
  }
  const leaves = entries
    .filter((e) => !e.startsWith("_"))
    .sort();

  // Load BBC's external-skills library once; pass into each leaf scan.
  const library = await readExternalLibrary();

  const out: LeafResources[] = [];
  for (const leaf of leaves) {
    const claudeMd = path.join(distDir, leaf, "CLAUDE.md");
    let text: string;
    try {
      text = await fs.readFile(claudeMd, "utf8");
    } catch {
      continue;
    }
    const shadowedPath = extractShadowedPath(text);
    let present = false;
    let agents: LeafAgent[] = [];
    let pinned: LeafSkill[] = [];
    if (shadowedPath) {
      try {
        const stat = await fs.stat(shadowedPath);
        present = stat.isDirectory();
      } catch {
        present = false;
      }
      if (present) {
        [agents, pinned] = await Promise.all([
          readAgents(shadowedPath),
          readSkillsLock(shadowedPath, library),
        ]);
      }
    }
    out.push({
      leaf,
      shadowed_repo_path: shadowedPath,
      shadowed_repo_present: present,
      agents,
      pinned_skills: pinned,
    });
  }
  return out;
}
