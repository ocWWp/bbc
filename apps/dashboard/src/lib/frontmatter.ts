/**
 * Minimal YAML frontmatter parser. Mirrors the bash scripts' approach.
 *
 * Supports:
 *   - Top-of-file ---\n...\n--- block.
 *   - flat key: value (string)
 *   - inline lists: key: [a, b, c]
 *   - nested blocks under a heading (e.g. manager_review:\n  verdict: approved)
 *
 * Does NOT support: anchors, references, multi-line scalars, deep nesting.
 * BBC's YAML never needs those.
 */

export type FmValue = string | string[] | Record<string, string>;
export type Frontmatter = Record<string, FmValue>;

const FM_RE = /^---\n([\s\S]*?)\n---\n?/;

export function parseFrontmatter(text: string): { fm: Frontmatter; body: string } {
  const m = text.match(FM_RE);
  if (!m) return { fm: {}, body: text };
  const yaml = m[1];
  const body = text.slice(m[0].length);
  const fm: Frontmatter = {};

  let nestedKey: string | null = null;
  let nestedObj: Record<string, string> | null = null;

  for (const rawLine of yaml.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line || line.startsWith("#")) continue;

    // Indented line → part of current nested block
    if (/^\s+\S/.test(line) && nestedKey && nestedObj) {
      const trimmed = line.trim();
      const colon = trimmed.indexOf(":");
      if (colon > 0) {
        const k = trimmed.slice(0, colon).trim();
        const v = trimmed.slice(colon + 1).trim().replace(/^["']|["']$/g, "");
        nestedObj[k] = v;
      }
      continue;
    }

    // Top-level key
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const rest = line.slice(colon + 1).trim();

    if (rest === "") {
      // start of nested block (or empty value)
      nestedKey = key;
      nestedObj = {};
      fm[key] = nestedObj;
      continue;
    } else {
      nestedKey = null;
      nestedObj = null;
    }

    if (rest.startsWith("[") && rest.endsWith("]")) {
      const inner = rest.slice(1, -1).trim();
      fm[key] = inner
        ? inner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""))
        : [];
    } else {
      fm[key] = rest.replace(/^["']|["']$/g, "");
    }
  }

  return { fm, body };
}

export function fmString(fm: Frontmatter, key: string): string | undefined {
  const v = fm[key];
  if (typeof v === "string") return v;
  return undefined;
}

export function fmObject(fm: Frontmatter, key: string): Record<string, string> | undefined {
  const v = fm[key];
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  return undefined;
}
