import type { ReactNode } from "react";

/**
 * Render a trusted inline-HTML string as React elements without using
 * dangerouslySetInnerHTML. Supported tags: <code>, <em>, <strong>.
 * Anything else is rendered as text. Source content lives in data.ts as
 * compile-time constants (no user input), so XSS is structurally impossible.
 */
const TAG_RE = /<(code|em|strong)>([\s\S]*?)<\/\1>/g;

export function SafeInline({ html }: { html: string }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  // Use String.matchAll() so we never call regex.exec().
  for (const m of html.matchAll(TAG_RE)) {
    const idx = m.index ?? 0;
    if (idx > cursor) parts.push(html.slice(cursor, idx));
    const tag = m[1];
    const inner = m[2];
    if (tag === "code") parts.push(<code key={key++}>{inner}</code>);
    else if (tag === "em") parts.push(<em key={key++}>{inner}</em>);
    else if (tag === "strong") parts.push(<strong key={key++}>{inner}</strong>);
    cursor = idx + m[0].length;
  }
  if (cursor < html.length) parts.push(html.slice(cursor));

  return <>{parts}</>;
}
