import fs from "node:fs/promises";
import path from "node:path";
import { bbcRepoRoot } from "./bbc-paths";

export type CommandInfo = {
  /** Slash form, e.g. "bbc:status" */
  name: string;
  description: string;
  /** Layer requirement parsed from <objective> or refusal_examples (best-effort) */
  layer_hint?: "any" | "leaf-or-manager" | "manager" | "main" | "manager-or-main";
  rel_path: string;
};

const CMDS_SUBDIR = path.join(".claude", "commands", "bbc");

/** Parse the simple frontmatter form used by Claude Code commands */
function parseCmd(text: string): { name?: string; description?: string; body: string } {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { body: text };
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    if (line.startsWith(" ") || line.startsWith("-")) continue; // skip indented
    const k = line.slice(0, colon).trim();
    const v = line.slice(colon + 1).trim();
    fm[k] = v;
  }
  return {
    name: fm.name,
    description: fm.description,
    body: text.slice(m[0].length),
  };
}

function inferLayerHint(body: string): CommandInfo["layer_hint"] | undefined {
  // Cheap heuristics off the body's natural language
  if (/Main only|main-only|`layer == main`/i.test(body)) return "main";
  if (/Manager only|`layer == manager`/i.test(body)) return "manager";
  if (/Manager and Main|manager.*main/i.test(body)) return "manager-or-main";
  if (/Distribution leaves and Manager|leaf.*manager/i.test(body)) return "leaf-or-manager";
  if (/Any layer/i.test(body)) return "any";
  return undefined;
}

export async function listCommands(): Promise<CommandInfo[]> {
  const root = bbcRepoRoot();
  const dir = path.join(root, CMDS_SUBDIR);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const files = entries.filter((f) => f.endsWith(".md")).sort();
  const out: CommandInfo[] = [];
  for (const f of files) {
    const full = path.join(dir, f);
    const text = await fs.readFile(full, "utf8");
    const parsed = parseCmd(text);
    if (!parsed.name) continue;
    out.push({
      name: parsed.name,
      description: parsed.description ?? "(no description)",
      layer_hint: inferLayerHint(parsed.body),
      rel_path: path.relative(root, full),
    });
  }
  return out;
}
