"use client";

import React, { useEffect, useState } from "react";

/**
 * Extracting transitional state. Center: a mock dump text with supertag-
 * colored highlights revealing as the parser "finds" them. Right: a live
 * counter climbing as supertags get hit. No spinner — this is the parse
 * becoming visible.
 */

type Hit = { tag: string };

const STAGED_HITS: ReadonlyArray<Hit> = [
  { tag: "vendor" },
  { tag: "team" },
  { tag: "voice" },
  { tag: "decision" },
  { tag: "team" },
];

const SUPERTAGS = [
  "voice", "decision", "vendor", "team", "product",
  "glossary", "skill", "source_artifact", "note",
] as const;

const MOCK_TEXT = `# notes from the seed-round call · 04/28

ok so we're announcing $2.4M in 10 days. lead is %vendor%Hardin Ventures%/vendor% (%team%Maya Hardin%/team%). also: Ridgeline, plus angels.

— %voice%voice on this: matter-of-fact, no "thrilled to announce". lowercase. say what we built and what it does.%/voice%
— %decision%don't put the dollar amount in the headline. lead with the wedge: typed memory for agents.%/decision%

people on the call: %team%priya (cto, IST)%/team%, me, devon (eng), and maya.`;

function renderHighlighted(text: string, revealCount: number): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let revealsSeen = 0;
  const re = /%([a-z_]+)%([\s\S]*?)%\/\1%/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) parts.push(text.slice(cursor, m.index));
    if (revealsSeen < revealCount) {
      parts.push(<mark key={m.index} className={`mark-${m[1]}`}>{m[2]}</mark>);
    } else {
      parts.push(m[2]);
    }
    revealsSeen += 1;
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

export function ExtractingStep() {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    const total = STAGED_HITS.length;
    let i = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (cancelled) return;
      i += 1;
      setRevealed(Math.min(i, total));
      if (i < total) {
        timer = setTimeout(tick, 700 + Math.random() * 400);
      }
    };
    timer = setTimeout(tick, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const counts: Record<string, number> = {
    voice: 0, decision: 0, vendor: 0, team: 0,
    product: 0, glossary: 0, skill: 0, source_artifact: 0, note: 0,
  };
  for (let i = 0; i < revealed; i++) {
    const tag = STAGED_HITS[i].tag;
    counts[tag] = (counts[tag] ?? 0) + 1;
  }

  return (
    <div className="extract">
      <section className="extract-stream">
        <header className="extract-stream-head">
          <span className="scan">
            <span className="dot" />
            <span>structuring · pass 1 of 1</span>
          </span>
          <span className="right">
            <span>parser · <strong>claude</strong></span>
            <span style={{ color: "var(--paper-rule-2)" }}>·</span>
            <span><strong>{revealed}</strong> / {STAGED_HITS.length} hits</span>
          </span>
        </header>
        <div className="extract-text">
          {renderHighlighted(MOCK_TEXT, revealed)}
          <span className="extract-cursor" />
        </div>
      </section>

      <aside className="counters">
        <div className="counters-head">
          <span className="lab">live tally · climbing</span>
          <span className="ttl">
            <em>structuring</em> your dump into typed memory.
          </span>
        </div>

        <div className="counters-list">
          {SUPERTAGS.map((k) => {
            const n = counts[k] ?? 0;
            const hit = n > 0;
            return (
              <div
                key={k}
                className={"counter-row " + (hit ? "is-hit" : "")}
                style={{ ["--tag-color" as string]: `var(--t-${k})` }}
              >
                <span className="pre"><span className="dot" /></span>
                <span className="tag-name">{k}</span>
                <span className="n">{n}</span>
              </div>
            );
          })}
        </div>

        <div className="counters-foot">
          everything you see will land in the <strong>review queue</strong>, not your brain.
          you'll accept items one-by-one or as a batch.
        </div>
      </aside>
    </div>
  );
}
