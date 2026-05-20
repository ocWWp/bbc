"use client";

import Link from "next/link";

export type CitationChipProps = {
  memoryId: string;
  label?: string;
  /**
   * Memory type (decision, voice, vendor, team, product, glossary, skill,
   * source_artifact, note). When set, exposed as `data-type` so the
   * `.citation-chip[data-type="..."]` rule in globals.css binds the
   * matching `--t-<type>` token to `--chip-tint`. Historical citations
   * persisted before v1.8 don't carry type — those chips render in the
   * neutral `--paper-muted` fallback.
   */
  type?: string | null;
  /**
   * When true, render with inline-flow spacing (`mx-0.5 align-baseline`)
   * for use inside prose paragraphs. Default false (block chip).
   */
  inline?: boolean;
};

const MAX_LABEL_CHARS = 40;

/**
 * Renders a citation chip linking to /memory/<id>. Title comes through
 * from the citation SSE event when known (F5); when unknown, falls back
 * to a short id-prefix so the chip remains identifiable. Per-type color
 * is driven by `data-type` + the CSS rule block in globals.css; visual
 * style lives entirely in the `.citation-chip` rule, not inline classes.
 */
export function CitationChip({ memoryId, label, type, inline = false }: CitationChipProps) {
  const raw = label?.trim() || `memory · ${memoryId.slice(0, 6)}`;
  const display =
    raw.length > MAX_LABEL_CHARS ? `${raw.slice(0, MAX_LABEL_CHARS - 1)}…` : raw;
  const typeAttr = type && type.trim() ? { "data-type": type } : {};
  const className = inline ? "citation-chip mx-0.5 align-baseline" : "citation-chip";
  const testIdPrefix = inline ? "inline-citation" : "citation-chip";
  return (
    <Link
      href={`/memory/${memoryId}`}
      className={className}
      {...typeAttr}
      data-testid={`${testIdPrefix}-${memoryId}`}
      title={raw}
    >
      <span aria-hidden className="citation-chip-dot" />
      <span className="citation-chip-label">{display}</span>
    </Link>
  );
}
