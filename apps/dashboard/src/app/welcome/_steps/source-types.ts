// Shared shapes for sources collected during onboarding. A `SourceItem` is one
// row the user has attached to their brain-dump (a fetched URL, a dropped file).
// The pasted-text path is implicit -- there is always one text "source" backing
// the textarea content, and it gets its own sourceId at submit time.

import type { Proposal } from "@/lib/memory/extractor/types";

export type SourceKind = "text" | "url" | "file";

export type SourceItem = {
  sourceId: string;
  kind: Exclude<SourceKind, "text">; // text is implicit in the textarea
  label: string; // user-facing chip label ("acme.com/handbook", "README.md")
  rawText: string;
  locator: Record<string, unknown>;
  redactions?: Record<string, number>;
  reused?: boolean;
};

// Proposals carry their origin so the review step can attribute and bulk-accept
// can group inserts by source. The orchestrator stamps this; the extractor
// never sees or returns _sourceId.
export type ProposalWithOrigin = Proposal & {
  _sourceId?: string; // undefined when origin is the textarea text
  _sourceKind?: SourceKind;
  _sourceLabel?: string;
};
