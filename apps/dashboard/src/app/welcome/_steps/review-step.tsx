"use client";

import React, { useMemo, useState } from "react";
import type { ProposalWithOrigin } from "./source-types";

const TAG_DESC: Record<string, string> = {
  decision: "ADR-style — what we chose and what it costs",
  voice: "tone, words to use, words to ban",
  team: "people, roles, who owns what",
  vendor: "external services & dependencies",
  product: "positioning, features, what it does",
  glossary: "domain terms with one canonical definition",
  skill: "how-tos: 'to do X, run Y, then Z'",
  source_artifact: "raw inputs the memories came from",
  note: "things to remember that don't fit elsewhere",
};

const TAG_ORDER = [
  "decision", "voice", "team", "vendor", "product",
  "glossary", "skill", "source_artifact", "note",
] as const;

type Props = {
  proposals: ProposalWithOrigin[];
  onAcceptAll: (final: ProposalWithOrigin[]) => Promise<void>;
  onBack: () => void;
  error: string | null;
};

/**
 * Renders a Proposal's `fields` object as ordered key/value rows for the
 * typed-field grid. Values can be strings, numbers, arrays of strings, or
 * nested objects (we just JSON-stringify those).
 */
function renderFieldValue(value: unknown): React.ReactNode {
  if (value == null || value === "") return <em>—</em>;
  if (Array.isArray(value)) {
    return value
      .map((v, i) => (
        <React.Fragment key={i}>
          {i > 0 && ", "}
          <em>&quot;{String(v)}&quot;</em>
        </React.Fragment>
      ));
  }
  if (typeof value === "object") return <em>{JSON.stringify(value)}</em>;
  return String(value);
}

function fieldsEntries(fields: unknown): Array<[string, unknown]> {
  if (!fields || typeof fields !== "object") return [];
  return Object.entries(fields as Record<string, unknown>).filter(
    ([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0) && v !== "",
  );
}

export function ReviewStep({ proposals, onAcceptAll, onBack, error }: Props) {
  const [dropped, setDropped] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const byTag: Record<string, Array<{ idx: number; p: ProposalWithOrigin }>> = {};
    proposals.forEach((p, idx) => {
      const tag = p.type;
      if (!byTag[tag]) byTag[tag] = [];
      byTag[tag].push({ idx, p });
    });
    return TAG_ORDER
      .filter((tag) => byTag[tag]?.length)
      .map((tag) => ({ tag, items: byTag[tag] }));
  }, [proposals]);

  const selectedCount = proposals.length - dropped.size;

  function toggle(idx: number) {
    setDropped((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function selectAll() { setDropped(new Set()); }
  function dropAll() { setDropped(new Set(proposals.map((_, i) => i))); }

  async function accept() {
    setBusy(true);
    const final = proposals.filter((_, i) => !dropped.has(i));
    await onAcceptAll(final);
    setBusy(false);
  }

  return (
    <div className="review">
      <div style={{ maxWidth: 720, marginBottom: 16 }}>
        <div className="dump-eyebrow">
          <span className="dot" />
          <span>step 03 · review the parse</span>
        </div>
        <h1 className="dump-title" style={{ fontSize: 38, margin: "12px 0 8px" }}>
          we found {proposals.length}.{" "}
          <span className="serif">accept what&apos;s real.</span>
        </h1>
        <p style={{ fontSize: 15, color: "var(--paper-ink-2)", margin: 0, maxWidth: 560, lineHeight: 1.55 }}>
          uncheck anything the parser got wrong — the unchecked items drop on the floor.
          everything else lands in your brain, tagged and typed, ready to query.
        </p>
      </div>

      <div className="review-batch-strip">
        <span className="sel">{selectedCount} of {proposals.length} selected</span>
        <span style={{ color: "var(--paper-rule-2)" }}>·</span>
        <span>{groups.length} supertag{groups.length === 1 ? "" : "s"} represented</span>
        {dropped.size > 0 && (
          <>
            <span style={{ color: "var(--paper-rule-2)" }}>·</span>
            <span>{dropped.size} unchecked</span>
          </>
        )}
        <span className="actions">
          <button type="button" className="lin" onClick={selectAll}>select all</button>
          <button type="button" className="lin" onClick={dropAll}>drop all</button>
        </span>
      </div>

      <div className="review-list">
        {groups.map((g) => (
          <React.Fragment key={g.tag}>
            <div
              className="review-group-head"
              style={{ ["--tag-color" as string]: `var(--t-${g.tag})` }}
            >
              <span />
              <span
                className="pill"
                style={{
                  background: "color-mix(in oklab, var(--tag-color), transparent 88%)",
                  color: "var(--tag-color)",
                  borderColor: "color-mix(in oklab, var(--tag-color), transparent 70%)",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {g.tag}
              </span>
              <span><span className="desc">{TAG_DESC[g.tag] ?? ""}</span></span>
              <span className="cnt">{g.items.length}</span>
            </div>
            {g.items.map(({ idx, p }) => {
              const isDropped = dropped.has(idx);
              const fields = fieldsEntries(p.fields);
              return (
                <button
                  type="button"
                  key={idx}
                  className={"review-item " + (isDropped ? "is-dropped" : "")}
                  onClick={() => toggle(idx)}
                >
                  <span className="review-check">
                    {!isDropped && (
                      <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="2.5,7.5 5.5,10.5 11.5,4" />
                      </svg>
                    )}
                  </span>
                  <div>
                    <div className="review-body">
                      <strong>{p.title}</strong>
                      {p.body && <> — {p.body}</>}
                    </div>
                    {fields.length > 0 && (
                      <div className="review-fields">
                        {fields.map(([k, v], i) => (
                          <React.Fragment key={i}>
                            <span className="k">{k}</span>
                            <span className="v">{renderFieldValue(v)}</span>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="review-source">
                    {p._sourceLabel ?? "textarea"}
                    {p._sourceId && <span className="id">{p._sourceId.slice(0, 12)}…</span>}
                  </div>
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="dump-error" style={{ marginTop: 16 }}>{error}</div>
      )}

      <div className="review-foot">
        <span className="left">
          accepting <strong>{selectedCount} memories</strong> into your brain.
          you can edit any of them later from /memory.
        </span>
        <span className="right">
          <button type="button" className="dump-demo" onClick={onBack} disabled={busy}>
            <span className="pill-pre">←</span>
            <span>edit dump</span>
          </button>
          <button
            type="button"
            className="btn-go"
            onClick={accept}
            disabled={busy || selectedCount === 0}
          >
            {busy ? "accepting…" : `accept ${selectedCount} into brain`}
            <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2.5" y1="7" x2="11.5" y2="7" />
              <polyline points="8,3.5 11.5,7 8,10.5" />
            </svg>
          </button>
        </span>
      </div>
    </div>
  );
}
