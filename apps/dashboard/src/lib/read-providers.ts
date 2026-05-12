// Read provider-adapter YAMLs from memory/ops/providers/ at the repo root.
// In file-mode self-host this just reads the filesystem. In DB-mode hosted
// deploys we currently package the YAMLs into the build (no DB-side
// providers table yet -- F4 build phases will add one).

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { bbcRepoRoot } from "./bbc-paths";

export type ProviderAdapter = {
  id: string;
  providerId: string;
  status: "active" | "candidate" | "deprecated";
  implements: string[]; // role contracts (e.g. ["llm-provider"])
  scope: string;
  tags: string[];
  headline: string;
  description: string;
  filename: string;
};

const STATUS_ALLOW = new Set(["active", "candidate", "deprecated"]);

export async function readProviders(): Promise<ProviderAdapter[]> {
  const root = bbcRepoRoot();
  const dir = path.join(root, "memory", "ops", "providers");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const yamls = entries.filter(
    (f) => f.endsWith(".yaml") && !f.startsWith("_") && !f.startsWith("."),
  );
  const adapters: ProviderAdapter[] = [];
  for (const f of yamls) {
    const filepath = path.join(dir, f);
    let raw: string;
    try {
      raw = await readFile(filepath, "utf8");
    } catch {
      continue;
    }
    const parsed = matter(raw);
    const data = parsed.data ?? {};
    const providerId = String(data.provider_id ?? "").trim();
    if (!providerId) continue;
    const rawStatus = String(data.status ?? "candidate");
    const status: ProviderAdapter["status"] = STATUS_ALLOW.has(rawStatus)
      ? (rawStatus as ProviderAdapter["status"])
      : "candidate";
    const implementsList = Array.isArray(data.implements) ? data.implements.map(String) : [];
    const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
    const scope = String(data.scope ?? "org");

    // Pull the first non-empty heading + the first paragraph as headline +
    // description. Cheap-and-cheerful so we don't need a markdown parser.
    const body = parsed.content;
    const headlineMatch = body.match(/^#\s+(.+?)$/m);
    const headline = headlineMatch ? headlineMatch[1].trim() : providerId;
    const description = firstParagraph(body) ?? "";

    adapters.push({
      id: String(data.id ?? providerId),
      providerId,
      status,
      implements: implementsList,
      scope,
      tags,
      headline,
      description,
      filename: f,
    });
  }
  // Stable sort: active first, then by providerId.
  adapters.sort((a, b) => {
    const order = (s: ProviderAdapter["status"]) =>
      s === "active" ? 0 : s === "candidate" ? 1 : 2;
    const d = order(a.status) - order(b.status);
    if (d !== 0) return d;
    return a.providerId.localeCompare(b.providerId);
  });
  return adapters;
}

function firstParagraph(body: string): string | null {
  // Skip headings, code fences, list bullets; return the first prose paragraph.
  const lines = body.split("\n");
  const buf: string[] = [];
  let inCode = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const t = line.trim();
    if (t.startsWith("#") || t.startsWith("-") || t.startsWith("*") || t.startsWith(">")) {
      if (buf.length) break;
      continue;
    }
    if (!t) {
      if (buf.length) break;
      continue;
    }
    buf.push(t);
  }
  if (buf.length === 0) return null;
  const joined = buf.join(" ");
  return joined.length > 280 ? joined.slice(0, 277) + "…" : joined;
}
