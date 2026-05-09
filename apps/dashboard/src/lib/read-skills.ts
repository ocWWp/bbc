import fs from "node:fs/promises";
import path from "node:path";
import { bbcRepoRoot } from "./bbc-paths";
import { parseFrontmatter, fmString } from "./frontmatter";

export type SkillTier = "abstract" | "general" | "leaf";

export type SkillInfo = {
  skill_id: string;
  layer?: string; // main | manager | distribution
  scope?: string;
  is_abstract: boolean;
  extends?: string;
  tier: SkillTier;
  /** First prose sentence (or first non-empty paragraph trimmed to ~140 chars) */
  description: string;
  /** Relative path from BBC root, useful for the "where" column */
  rel_path: string;
};

const SKILLS_SUBDIR = path.join("memory", "skills");

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "_resolved") continue;
    const full = path.join(dir, name);
    const stat = await fs.stat(full);
    if (stat.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (full.endsWith(".yaml")) {
      out.push(full);
    }
  }
  return out;
}

/** Pull the first prose sentence from the body. Skips headings and frontmatter-y lines. */
function firstSentence(body: string): string {
  const lines = body.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#") || line.startsWith(">")) continue;
    if (line.startsWith("-") || line.startsWith("*")) continue;
    if (line.startsWith("```")) continue;
    if (/^\w+:/.test(line) && !line.includes(" ")) continue; // YAML-ish key:val
    // Take the first sentence (up to . ! ? followed by space or EOL)
    const m = line.match(/^([^.!?]+[.!?])(?:\s|$)/);
    if (m) return m[1].trim();
    return line.length > 140 ? line.slice(0, 140).trim() + "…" : line;
  }
  return "(no description)";
}

function tierFor(filePath: string, isAbstract: boolean): SkillTier {
  if (isAbstract) return "abstract";
  // memory/skills/general/* → general; memory/skills/<other>/* → leaf
  const parts = filePath.split(path.sep);
  const idx = parts.lastIndexOf("skills");
  if (idx >= 0 && parts[idx + 1] === "general") return "general";
  return "leaf";
}

export async function listSkills(): Promise<SkillInfo[]> {
  const root = bbcRepoRoot();
  const skillsDir = path.join(root, SKILLS_SUBDIR);
  const files = await walk(skillsDir);
  const out: SkillInfo[] = [];
  for (const f of files) {
    const text = await fs.readFile(f, "utf8");
    const { fm, body } = parseFrontmatter(text);
    const skill_id = fmString(fm, "skill_id");
    if (!skill_id) continue;
    const isAbstract = fmString(fm, "abstract") === "true";
    out.push({
      skill_id,
      layer: fmString(fm, "layer"),
      scope: fmString(fm, "scope"),
      is_abstract: isAbstract,
      extends: fmString(fm, "extends"),
      tier: tierFor(f, isAbstract),
      description: firstSentence(body),
      rel_path: path.relative(root, f),
    });
  }
  // Stable ordering: abstract → general → leaf, then alphabetical
  const order: Record<SkillTier, number> = { abstract: 0, general: 1, leaf: 2 };
  out.sort((a, b) => {
    const t = order[a.tier] - order[b.tier];
    return t !== 0 ? t : a.skill_id.localeCompare(b.skill_id);
  });
  return out;
}
