/**
 * Minimal YAML-frontmatter parser. Lifted from apps/dashboard/src/lib/frontmatter.ts
 * so LocalStore can parse without a dependency back into the dashboard.
 *
 * Handles: scalar key:value, simple top-level objects (one nested level),
 * inline arrays. Multi-line YAML structures (folded scalars, deep nesting)
 * are NOT handled — BBC frontmatter is intentionally simple.
 */

export type Frontmatter = Record<string, unknown>;

const ARRAY_RE = /^\[(.*)\]$/;

export function parseFrontmatter(text: string): { fm: Frontmatter; body: string } {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { fm: {}, body: text };
  }
  const lines = text.split(/\r?\n/);
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) return { fm: {}, body: text };

  const fmLines = lines.slice(1, endIdx);
  const body = lines.slice(endIdx + 1).join("\n");
  const fm: Frontmatter = {};

  let currentKey: string | null = null;
  let currentObj: Record<string, string> | null = null;

  for (const raw of fmLines) {
    if (!raw.trim()) continue;

    // Nested key under an object (2-space indent).
    if (raw.startsWith("  ") && currentObj && currentKey) {
      const subMatch = raw.trim().match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (subMatch) {
        currentObj[subMatch[1]] = stripQuotes(subMatch[2]);
      }
      continue;
    }

    const m = raw.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2];

    if (value === "") {
      // Object follows on next indented lines.
      currentKey = key;
      currentObj = {};
      fm[key] = currentObj;
      continue;
    }

    const arrMatch = value.match(ARRAY_RE);
    if (arrMatch) {
      fm[key] = arrMatch[1]
        .split(",")
        .map((s) => stripQuotes(s.trim()))
        .filter((s) => s !== "");
    } else {
      fm[key] = stripQuotes(value);
    }
    currentKey = null;
    currentObj = null;
  }

  return { fm, body };
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

export function fmString(fm: Frontmatter, key: string): string | undefined {
  const v = fm[key];
  return typeof v === "string" ? v : undefined;
}

export function fmObject(fm: Frontmatter, key: string): Record<string, string> | undefined {
  const v = fm[key];
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, string>;
  }
  return undefined;
}
