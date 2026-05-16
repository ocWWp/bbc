"use client";

import Link from "next/link";

export type CitationChipProps = {
  memoryId: string;
  label?: string;
};

const MAX_LABEL_CHARS = 40;

/**
 * Renders a citation chip linking to /memory/<id>. Title comes through
 * from the citation SSE event when known (F5); when unknown, falls back
 * to a short id-prefix so the chip remains identifiable.
 */
export function CitationChip({ memoryId, label }: CitationChipProps) {
  const raw = label?.trim() || `memory · ${memoryId.slice(0, 6)}`;
  const display =
    raw.length > MAX_LABEL_CHARS ? `${raw.slice(0, MAX_LABEL_CHARS - 1)}…` : raw;
  return (
    <Link
      href={`/memory/${memoryId}`}
      className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      data-testid={`citation-chip-${memoryId}`}
      title={raw}
    >
      <span aria-hidden className="inline-block size-1.5 shrink-0 rounded-full bg-foreground/40" />
      <span className="truncate">{display}</span>
    </Link>
  );
}
