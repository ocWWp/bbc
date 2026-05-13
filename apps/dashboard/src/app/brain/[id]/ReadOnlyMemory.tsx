"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import type { PartialBlock } from "@blocknote/core";
import { TypeChip } from "@/components/memory/type-chip";
import type { MemoryItemRow } from "../../memory/queries";
import type { Supertag } from "@/lib/memory/types";
import type { Database } from "@/lib/supabase/database.types";
import { flagMemory } from "./flag-action";

type RelationKind = Database["public"]["Enums"]["memory_relation_kind"];

type Relations = {
  outgoing: Array<{
    id: string;
    kind: RelationKind;
    dst: { id: string; type: Supertag; title: string; slug: string } | null;
  }>;
  incoming: Array<{
    id: string;
    kind: RelationKind;
    src: { id: string; type: Supertag; title: string; slug: string } | null;
  }>;
};

// Same dynamic-import dance as editor-shell.tsx: BlockNote touches `window`
// at module load, so we lazy-load it client-only.
const BlockEditor = dynamic(
  () => import("@/components/memory/block-editor").then((m) => m.BlockEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[24rem] animate-pulse rounded-lg bg-muted/40" aria-hidden />
    ),
  },
);

/**
 * Read-only memory detail view for members. Mirrors apps/dashboard/src/app/
 * memory/[id]/editor-shell.tsx but with:
 *   - No save/saving state, no auto-save handler.
 *   - No publish/archive buttons.
 *   - No RelationPicker (members cannot create relations).
 *   - No TypedForm (the editable fields panel) — fields shown as a read-only
 *     key/value list.
 *   - Body blocks rendered through BlockEditor with editable=false.
 *   - Relation links point at /brain/<id> (not /memory/<id>).
 *
 * UI-only enforcement; the *security* of read-only access is the operator+
 * gate on every mutating action in memory/actions.ts. Members hitting any
 * mutating action via curl still get a forbidden response.
 */
export function ReadOnlyMemory({
  item,
  relations,
}: {
  item: MemoryItemRow;
  relations: Relations;
}) {
  const initialBlocks =
    Array.isArray(item.body_blocks) && item.body_blocks.length > 0
      ? (item.body_blocks as PartialBlock[])
      : undefined;
  const type = item.type as Supertag;
  const fields = (item.fields ?? {}) as Record<string, unknown>;
  const fieldEntries = Object.entries(fields).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );

  return (
    <div className="container page mem-edit" data-testid="brain-detail">
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <Link href="/brain">brain</Link>
            <span className="sep">/</span>
            <span className="current">
              <TypeChip type={type} size="xs" />
              <span>{item.title || "untitled"}</span>
            </span>
          </div>
        </div>
        <div className="page-actions">
          <span className="mem-save-pill is-idle">read-only</span>
        </div>
      </header>

      <div className="mem-edit-grid">
        <main className="mem-edit-main">
          <h1 className="mem-edit-title" style={{ pointerEvents: "none" }}>
            {item.title || "untitled"}
          </h1>
          <div className="mem-edit-body">
            <BlockEditor initialContent={initialBlocks} editable={false} />
          </div>
        </main>

        <aside className="mem-edit-aside">
          <section className="set-block">
            <header className="set-head">
              <h2>properties</h2>
            </header>
            <div className="set-body">
              {fieldEntries.length === 0 ? (
                <p className="mem-empty">no properties set.</p>
              ) : (
                <dl
                  className="mem-readonly-fields"
                  style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "6px 12px", margin: 0 }}
                >
                  {fieldEntries.map(([k, v]) => (
                    <div key={k} style={{ display: "contents" }}>
                      <dt
                        style={{
                          fontFamily: "var(--font-geist-mono), monospace",
                          fontSize: 11,
                          color: "var(--paper-muted)",
                          textTransform: "lowercase",
                        }}
                      >
                        {k}
                      </dt>
                      <dd style={{ fontSize: 13, color: "var(--paper-ink-2)", margin: 0 }}>
                        {typeof v === "string" || typeof v === "number"
                          ? String(v)
                          : JSON.stringify(v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </section>

          <section className="set-block">
            <header className="set-head">
              <h2>status</h2>
              <span className="set-meta">{item.status}</span>
            </header>
            <div className="set-body">
              <p className="mem-empty">
                Need this changed? Use <em>Flag this</em> below to propose an
                edit. Admins review every proposal.
              </p>
              <FlagThisBlock memoryId={item.id} />
            </div>
          </section>

          <section className="set-block">
            <header className="set-head">
              <h2>relations</h2>
            </header>
            <div className="set-body">
              {relations.outgoing.length === 0 && relations.incoming.length === 0 ? (
                <p className="mem-empty">no relations.</p>
              ) : (
                <div className="mem-relations">
                  {relations.outgoing.length > 0 && (
                    <div>
                      <div className="mem-rel-label">outgoing</div>
                      {relations.outgoing.map((r) => (
                        <RelationRow key={r.id} kind={r.kind} target={r.dst} />
                      ))}
                    </div>
                  )}
                  {relations.incoming.length > 0 && (
                    <div>
                      <div className="mem-rel-label">backlinks</div>
                      {relations.incoming.map((r) => (
                        <RelationRow key={r.id} kind={r.kind} target={r.src} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

type FlagState =
  | { phase: "idle" }
  | { phase: "open" }
  | { phase: "submitting" }
  | { phase: "submitted"; proposalId: string }
  | { phase: "error"; message: string };

function FlagThisBlock({ memoryId }: { memoryId: string }) {
  const [state, setState] = useState<FlagState>({ phase: "idle" });
  const [reason, setReason] = useState("");
  const [, startTransition] = useTransition();

  if (state.phase === "submitted") {
    return (
      <div
        role="status"
        style={{
          marginTop: 12,
          padding: "10px 12px",
          background: "var(--paper-bg-2)",
          border: "1px solid var(--paper-rule)",
          borderRadius: 8,
          fontSize: 13,
          color: "var(--paper-ink-2)",
        }}
      >
        Flag filed. An admin will review it shortly.{" "}
        <Link href="/inbox" style={{ color: "var(--paper-accent)" }}>
          See resolutions in /inbox
        </Link>
        .
      </div>
    );
  }

  if (state.phase === "idle") {
    return (
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn"
          onClick={() => setState({ phase: "open" })}
          data-testid="flag-this-open"
        >
          Flag this
        </button>
      </div>
    );
  }

  return (
    <form
      style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!reason.trim()) return;
        setState({ phase: "submitting" });
        startTransition(async () => {
          const fd = new FormData();
          fd.append("memory_id", memoryId);
          fd.append("reason", reason.trim());
          const res = await flagMemory(fd);
          if (res.ok) {
            setReason("");
            setState({ phase: "submitted", proposalId: res.id });
          } else {
            setState({
              phase: "error",
              message: res.code === "store_error" && res.error ? res.error : res.code,
            });
          }
        });
      }}
    >
      <label
        htmlFor="flag-reason"
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          color: "var(--paper-muted)",
        }}
      >
        What's wrong / what should change?
      </label>
      <textarea
        id="flag-reason"
        name="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        required
        placeholder="e.g. this voice rule contradicts what we said in last week's PRD"
        style={{
          width: "100%",
          resize: "vertical",
          padding: 8,
          fontSize: 13,
          background: "var(--paper-bg)",
          border: "1px solid var(--paper-rule)",
          borderRadius: 6,
          color: "var(--paper-ink)",
          fontFamily: "inherit",
        }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={state.phase === "submitting" || !reason.trim()}
          data-testid="flag-this-submit"
        >
          {state.phase === "submitting" ? "filing…" : "File flag"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setReason("");
            setState({ phase: "idle" });
          }}
          disabled={state.phase === "submitting"}
        >
          Cancel
        </button>
      </div>
      {state.phase === "error" && (
        <p style={{ color: "var(--paper-danger, #b3261e)", fontSize: 12, margin: 0 }}>
          {state.message}
        </p>
      )}
    </form>
  );
}

function RelationRow({
  kind,
  target,
}: {
  kind: RelationKind;
  target: { id: string; type: Supertag; title: string; slug: string } | null;
}) {
  if (!target) return null;
  return (
    <div className="mem-rel-row">
      <span className="mem-rel-kind">{kind}</span>
      <Link href={`/brain/${target.id}`} className="mem-rel-link">
        <TypeChip type={target.type} size="xs" />
        <span className="mem-rel-title">{target.title}</span>
      </Link>
    </div>
  );
}
