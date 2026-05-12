import fs from "node:fs/promises";
import path from "node:path";
import type { Tool, ToolsStore } from "../interfaces";
import { LocalBindingsStore } from "./bindings";

/**
 * File-mode tool catalog reader.
 *
 * Source files:
 *   memory/ops/providers/<id>.yaml   — one file per provider adapter (e.g. anthropic-claude-sonnet.yaml)
 *   memory/ops/bindings.yaml         — current role→provider table, parsed by LocalBindingsStore
 *
 * BBC YAML is simple frontmatter + a "## Metadata" key-value block; we parse
 * with regex/split rather than pulling js-yaml. Matches the pattern used in
 * apps/dashboard/src/lib/read-commands.ts.
 */
export class LocalToolsStore implements ToolsStore {
  private readonly bindingsStore: LocalBindingsStore;

  constructor(private readonly bbcRoot: string) {
    this.bindingsStore = new LocalBindingsStore(bbcRoot);
  }

  async list(): Promise<Tool[]> {
    const dir = path.join(this.bbcRoot, "memory", "ops", "providers");
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return [];
    }

    const out: Tool[] = [];
    for (const name of entries) {
      if (!name.endsWith(".yaml") || name.startsWith("_") || name.startsWith("example-")) continue;
      const filePath = path.join(dir, name);
      const text = await fs.readFile(filePath, "utf8").catch(() => "");
      if (!text) continue;
      const tool = parseProviderYaml(text);
      if (tool) out.push(tool);
    }

    return out;
  }

  async resolveRole(role: string): Promise<Tool | null> {
    const bindings = await this.bindingsStore.list();
    const binding = bindings.find((b) => b.role === role && b.kind !== "unbound");
    if (!binding) return null;

    const all = await this.list();
    return all.find((t) => t.provider_id === binding.provider) ?? null;
  }

  async candidatesFor(role: string): Promise<Tool[]> {
    const all = await this.list();
    return all.filter((t) => t.implements.includes(role) && t.status !== "archived");
  }
}

/**
 * Parse a provider YAML into a Tool. Returns null when the file lacks required
 * frontmatter fields (provider_id, implements). Tolerant of missing optional
 * fields — produces "unknown" status and empty metadata in that case.
 */
function parseProviderYaml(text: string): Tool | null {
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const fm = parseSimpleYaml(fmMatch[1]);

  const provider_id = fm["provider_id"];
  if (!provider_id) return null;

  const implementsList = parseInlineList(fm["implements"]);
  const tags = parseInlineList(fm["tags"]);
  const rawStatus = fm["status"];
  const status: Tool["status"] =
    rawStatus === "active" || rawStatus === "candidate" || rawStatus === "archived"
      ? rawStatus
      : "unknown";

  const metadata = parseMetadataBlock(text);

  return {
    provider_id,
    implements: implementsList,
    status,
    metadata,
    tags,
  };
}

/** Single-level YAML: key: value. Ignores nested blocks (mapping/list) at the top level. */
function parseSimpleYaml(yaml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of yaml.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith(" ") || line.startsWith("-")) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const k = line.slice(0, colon).trim();
    let v = line.slice(colon + 1).trim();
    v = v.replace(/^["']|["']$/g, "");
    out[k] = v;
  }
  return out;
}

/** Parse a YAML inline list "[a, b, c]" into ["a", "b", "c"]. Returns [] for missing/malformed. */
function parseInlineList(raw: string | undefined): string[] {
  if (!raw) return [];
  const m = raw.match(/^\[(.*)\]$/);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter((s) => s.length > 0);
}

/**
 * Parse the "## Metadata" block:
 *   ## Metadata
 *   - key: value
 *   - other_key: other_value
 * Stops at the next H2 (`## `) or EOF.
 */
function parseMetadataBlock(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const m = text.match(/^## Metadata\s*\n([\s\S]*?)(?=\n## |\n*$)/m);
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("-")) continue;
    const body = trimmed.slice(1).trim();
    const colon = body.indexOf(":");
    if (colon < 0) continue;
    const k = body.slice(0, colon).trim();
    let v = body.slice(colon + 1).trim();
    // Strip trailing "# comment" if any
    const hashIdx = v.indexOf("#");
    if (hashIdx >= 0) v = v.slice(0, hashIdx).trim();
    v = v.replace(/^["']|["']$/g, "");
    if (k && v) out[k] = v;
  }
  return out;
}
