"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import type { PartialBlock } from "@blocknote/core";
import { TypeChip } from "@/components/memory/type-chip";
import type { MemoryItemRow } from "../../memory/queries";
import type { Supertag } from "@/lib/memory/types";
import type { Database } from "@/lib/supabase/database.types";

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
