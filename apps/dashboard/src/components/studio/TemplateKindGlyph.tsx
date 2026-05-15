// One small glyph + a friendly output-type label per template kind. Used by
// the workflow card grid in TemplateFirstStudioClient so each card reads as
// "this produces an X post / a document / a blog post" at a glance.
//
// Glyphs are tiny SVGs (16px viewbox) — no external icon dep, lucide-react
// in this repo is pinned to a very old version and adding new icons cleanly
// is more friction than these hand-drawn shapes.

import type { PreviewKind } from "@/lib/studio/templates/types";

const KIND_LABEL_MAP: Record<PreviewKind, string> = {
  x_post: "X post",
  x_thread: "X thread",
  threads_post: "Threads post",
  linkedin_post: "LinkedIn post",
  blog_draft: "Blog post",
  script: "Script",
  doc: "Document",
  plain: "Document",
};

// Public lookup that accepts any string (StudioClientTemplate widens `kind`
// to string), falling back to "Document" so an unknown future kind still
// renders something sensible instead of crashing the card.
export function kindLabel(kind: string): string {
  return KIND_LABEL_MAP[kind as PreviewKind] ?? "Document";
}

/** @deprecated Use {@link kindLabel} for string-typed kinds. */
export const KIND_LABEL = KIND_LABEL_MAP;

function Lines({ rows }: { rows: ReadonlyArray<number> }) {
  return (
    <>
      {rows.map((w, i) => (
        <rect key={i} x={3} y={4 + i * 3.2} width={w} height={1.4} rx={0.7} fill="currentColor" />
      ))}
    </>
  );
}

function Glyph({ kind }: { kind: PreviewKind }) {
  switch (kind) {
    case "x_post":
      // single short post — one rectangle "card"
      return (
        <>
          <rect x={2} y={4} width={12} height={8} rx={2} fill="none" stroke="currentColor" strokeWidth={1.2} />
          <Lines rows={[6, 4]} />
        </>
      );
    case "x_thread":
      // stacked posts
      return (
        <>
          <rect x={2} y={2.5} width={9} height={5} rx={1.5} fill="none" stroke="currentColor" strokeWidth={1.1} />
          <rect x={5} y={8.5} width={9} height={5} rx={1.5} fill="none" stroke="currentColor" strokeWidth={1.1} />
        </>
      );
    case "threads_post":
      // two overlapping circles — Threads-ish
      return (
        <>
          <circle cx={6} cy={8} r={3.5} fill="none" stroke="currentColor" strokeWidth={1.2} />
          <circle cx={10} cy={8} r={3.5} fill="none" stroke="currentColor" strokeWidth={1.2} />
        </>
      );
    case "linkedin_post":
      // square + dot (the LinkedIn-like 'in')
      return (
        <>
          <rect x={2.5} y={2.5} width={11} height={11} rx={2} fill="none" stroke="currentColor" strokeWidth={1.2} />
          <rect x={5} y={7.5} width={1.6} height={4} rx={0.4} fill="currentColor" />
          <circle cx={5.8} cy={5.4} r={0.9} fill="currentColor" />
          <path d="M8 11.5 V8.8 Q8 7.2 9.4 7.2 Q10.8 7.2 10.8 8.8 V11.5" stroke="currentColor" strokeWidth={1.1} fill="none" />
        </>
      );
    case "blog_draft":
      // page with a hanging title underline
      return (
        <>
          <rect x={3} y={2} width={10} height={12} rx={1} fill="none" stroke="currentColor" strokeWidth={1.1} />
          <rect x={4.5} y={4.5} width={5.5} height={0.9} fill="currentColor" />
          <Lines rows={[7, 7, 5]} />
        </>
      );
    case "script":
      // play-style triangle in a square
      return (
        <>
          <rect x={2.5} y={2.5} width={11} height={11} rx={2} fill="none" stroke="currentColor" strokeWidth={1.2} />
          <path d="M7 5.5 L11 8 L7 10.5 Z" fill="currentColor" />
        </>
      );
    case "doc":
    case "plain":
      // document with folded corner
      return (
        <>
          <path d="M4 2 H10 L13 5 V14 H4 Z" fill="none" stroke="currentColor" strokeWidth={1.1} />
          <path d="M10 2 V5 H13" fill="none" stroke="currentColor" strokeWidth={1.1} />
          <Lines rows={[7, 7, 5]} />
        </>
      );
  }
}

export function TemplateKindGlyph({ kind, className }: { kind: string; className?: string }) {
  const safeKind: PreviewKind = (KIND_LABEL_MAP as Record<string, unknown>)[kind] ? (kind as PreviewKind) : "plain";
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      className={className}
      aria-hidden
      focusable={false}
    >
      <Glyph kind={safeKind} />
    </svg>
  );
}
