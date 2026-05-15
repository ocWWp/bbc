"use client";

import Link from "next/link";
import { BrainView } from "@/components/memory/BrainView";
import type { ProposalWithOrigin } from "./source-types";

type Props = {
  count: number;
  firstId: string | null;
  tenantSlug: string;
  proposals: ProposalWithOrigin[];
};

const TAG_ORDER = [
  "decision", "voice", "team", "vendor", "product",
  "glossary", "skill", "source_artifact", "note",
] as const;

export function DoneStep({ count, firstId, tenantSlug, proposals }: Props) {
  const tally = TAG_ORDER
    .map((tag) => ({ tag, n: proposals.filter((p) => p.type === tag).length }))
    .filter((r) => r.n > 0);

  const nodes = proposals.map((p, i) => ({
    id: firstId ?? `mem-${i}`,
    title: p.title,
    tag: p.type,
  }));

  return (
    <div className="done">
      <div className="done-copy">
        <span className="done-stamp">
          <span className="glyph">
            <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2.5,7.5 5.5,10.5 11.5,4" />
            </svg>
          </span>
          <span>{count} memories accepted · {tenantSlug}</span>
        </span>

        <h1>
          your brain is <span className="serif">live</span>.<br />
          pick where to point it next.
        </h1>
        <p className="blurb">
          studios are role-shaped agents that read your brain — marketing, engineering,
          founder, designer, support. each pulls the supertags it needs, runs a task,
          and files proposals back to the queue for you to review.
        </p>

        <div className="done-receipt">
          <span><strong>{count}</strong> items</span>
          <span className="sep">·</span>
          <span><strong>{tally.length}</strong> supertags</span>
          <span className="sep">·</span>
          <span>main layer</span>
          {firstId && (
            <>
              <span className="sep">·</span>
              <span>first <strong>{firstId.slice(0, 8)}</strong></span>
            </>
          )}
        </div>

        <div className="next-grid">
          <Link className="next-card is-primary" href="/queue">
            <span className="h">
              open the <span className="serif">queue</span>.
            </span>
            <span className="b">
              your home. every proposal from a studio lands here for review.
            </span>
            <span className="tail">
              <span>→ /queue</span>
              <span>↵</span>
            </span>
          </Link>
          <Link className="next-card" href="/gallery">
            <span className="h">
              open the <span className="serif">gallery</span>.
            </span>
            <span className="b">
              pick a template. it&apos;ll pull from your brain and draft something to review.
            </span>
            <span className="tail">
              <span>→ /gallery</span>
              <span>↗</span>
            </span>
          </Link>
          <Link className="next-card" href="/settings/api-keys">
            <span className="h">
              add <span className="serif">provider</span> keys.
            </span>
            <span className="b">
              BYOK. anthropic / openai. encrypted at rest with AES-256-GCM.
            </span>
            <span className="tail">
              <span>→ /settings/api-keys</span>
              <span>↗</span>
            </span>
          </Link>
        </div>
      </div>

      <div className="done-brain">
        <span className="done-brain-meta">
          <span className="dot" />
          <span>brain · live · {count} nodes</span>
        </span>
        <div className="brain-embed">
          <BrainView nodes={nodes} embedded />
        </div>
      </div>
    </div>
  );
}
