"use client";

import Link from "next/link";

export type CitationChipProps = {
  memoryId: string;
  label?: string;
};

/**
 * Renders an inline citation chip linking to /memory/<id>. The label
 * defaults to a short id-prefix; callers can pass a friendlier label
 * once the citation→title lookup lands (M3+).
 */
export function CitationChip({ memoryId, label }: CitationChipProps) {
  const display = label ?? `memory · ${memoryId.slice(0, 6)}`;
  return (
    <Link
      href={`/memory/${memoryId}`}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      data-testid={`citation-chip-${memoryId}`}
    >
      <span aria-hidden className="inline-block size-1.5 rounded-full bg-foreground/40" />
      {display}
    </Link>
  );
}
