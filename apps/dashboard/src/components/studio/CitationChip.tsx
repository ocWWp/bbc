import Link from "next/link";
import { TypeChip } from "@/components/memory/type-chip";
import type { Supertag } from "@/lib/memory/types";

export type CitationChipProps = {
  memoryId: string;
  /** Memory's supertag for the type chip. Some renderers don't have it; pass undefined. */
  type?: Supertag | string | null;
  /** Display label (usually the memory title; falls back to id if blank). */
  label: string;
  /** Optional bracketed citation number, e.g. [3]. */
  citationNumber?: number;
};

/**
 * Task 21: clickable citation chip. Every Studio's cited-memory rendering
 * routes through this component so a click takes the reader to the source.
 *
 * Always links to /brain/<memoryId>:
 *   - members land on the read-only brain detail view.
 *   - operator+ get redirected by /brain/[id]/page.tsx to the editable
 *     /memory/<id> view automatically. One href, both audiences.
 */
export function CitationChip({ memoryId, type, label, citationNumber }: CitationChipProps) {
  return (
    <Link
      href={`/brain/${memoryId}`}
      className="cite-chip"
      data-testid="citation-chip"
      title={label}
    >
      {typeof citationNumber === "number" ? (
        <span className="cite-chip-num tabular-nums">[{citationNumber}]</span>
      ) : null}
      {type ? <TypeChip type={type as Supertag} size="xs" /> : null}
      <span className="cite-chip-label">{label || memoryId}</span>
    </Link>
  );
}
