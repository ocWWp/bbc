// Renders text containing inline <cite mem_id="..."/> tags as plain text plus
// numbered superscript footnotes. Each cite is replaced with a <sup> link
// that scrolls to /memory/[id]. Tracks citation order across consecutive
// CitedText instances via the optional `numberFromContext` map so a multi-block
// run keeps a consistent footnote sequence.

import Link from "next/link";
import React from "react";

const CITE_RE = /<cite\s+mem_id\s*=\s*['"]([0-9a-fA-F-]{36})['"]\s*\/?>/g;

export type CitationContext = {
  // Mutates while rendering — maps mem_id -> displayed footnote number.
  numbers: Map<string, number>;
};

export function makeCitationContext(): CitationContext {
  return { numbers: new Map() };
}

type Props = {
  text: string;
  ctx?: CitationContext;
  // When true, render newlines as <br>; otherwise collapse to spaces. Default
  // is true (matches what people expect from social posts).
  preserveBreaks?: boolean;
  className?: string;
};

export function CitedText({ text, ctx, preserveBreaks = true, className }: Props) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let keyIdx = 0;

  for (const match of text.matchAll(CITE_RE)) {
    const before = text.slice(last, match.index);
    if (before) nodes.push(renderTextChunk(before, keyIdx++, preserveBreaks));
    const memId = match[1];
    const n = ctx
      ? (() => {
          const existing = ctx.numbers.get(memId);
          if (existing) return existing;
          const next = ctx.numbers.size + 1;
          ctx.numbers.set(memId, next);
          return next;
        })()
      : 1;
    nodes.push(
      <sup key={`cite-${keyIdx++}`} className="ml-px text-[0.6em] font-medium align-super">
        <Link
          href={`/memory/${memId}`}
          className="text-[var(--studio-accent)] hover:underline"
          aria-label={`Memory citation ${n}`}
        >
          [{n}]
        </Link>
      </sup>,
    );
    last = match.index + match[0].length;
  }
  const tail = text.slice(last);
  if (tail) nodes.push(renderTextChunk(tail, keyIdx, preserveBreaks));

  return <span className={className}>{nodes}</span>;
}

function renderTextChunk(s: string, key: number, preserveBreaks: boolean): React.ReactNode {
  if (!preserveBreaks) return <React.Fragment key={key}>{s.replace(/\s*\n\s*/g, " ")}</React.Fragment>;
  const lines = s.split("\n");
  return (
    <React.Fragment key={key}>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {line}
          {i < lines.length - 1 ? <br /> : null}
        </React.Fragment>
      ))}
    </React.Fragment>
  );
}
