"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import type { PartialBlock } from "@blocknote/core";
import { TypedForm } from "@/components/memory/typed-form";
import { TypeChip } from "@/components/memory/type-chip";
import { RelationPicker } from "@/components/memory/relation-picker";
import { archiveMemoryItem, publishMemoryItem, updateMemoryItem } from "../actions";

// BlockNote pulls @blocknote/mantine which touches `window` at module
// top-level. Load client-only so SSR doesn't trip a 500 on every visit.
const BlockEditor = dynamic(
  () => import("@/components/memory/block-editor").then((m) => m.BlockEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[24rem] animate-pulse rounded-lg bg-muted/40" aria-hidden />
    ),
  },
);
import type { MemoryItemRow } from "../queries";
import type { Supertag } from "@/lib/memory/types";
import type { Database } from "@/lib/supabase/database.types";

type RelationKind = Database["public"]["Enums"]["memory_relation_kind"];

type Relations = {
  outgoing: Array<{ id: string; kind: RelationKind; dst: { id: string; type: Supertag; title: string; slug: string } | null }>;
  incoming: Array<{ id: string; kind: RelationKind; src: { id: string; type: Supertag; title: string; slug: string } | null }>;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function EditorShell({ item, relations }: { item: MemoryItemRow; relations: Relations }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (patch: Parameters<typeof updateMemoryItem>[1]) => {
      if (debounce.current) clearTimeout(debounce.current);
      setSaveState("saving");
      debounce.current = setTimeout(() => {
        startTransition(async () => {
          const res = await updateMemoryItem(item.id, patch);
          if (res.ok) {
            setSaveState("saved");
            setError(null);
            setTimeout(() => setSaveState("idle"), 1200);
          } else {
            setSaveState("error");
            setError(res.error);
          }
        });
      }, 500);
    },
    [item.id],
  );

  const initialBlocks = Array.isArray(item.body_blocks) && item.body_blocks.length > 0
    ? (item.body_blocks as PartialBlock[])
    : undefined;

  const type = item.type as Supertag;

  return (
    <div className="container page mem-edit">
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <Link href="/queue">acme</Link>
            <span className="sep">/</span>
            <Link href="/memory">memory</Link>
            <span className="sep">/</span>
            <span className="current">
              <TypeChip type={type} size="xs" />
              <span>{item.title || "untitled"}</span>
            </span>
          </div>
        </div>
        <div className="page-actions">
          <span className={`mem-save-pill is-${saveState}`}>
            {saveState === "saving" && "saving…"}
            {saveState === "saved" && "saved"}
            {saveState === "error" && "save failed"}
            {saveState === "idle" && "auto-saved"}
          </span>
        </div>
      </header>

      <div className="mem-edit-grid">
        <main className="mem-edit-main">
          <input
            defaultValue={item.title ?? ""}
            placeholder="untitled"
            onChange={(e) => save({ title: e.target.value })}
            className="mem-edit-title"
          />
          <div className="mem-edit-body">
            <BlockEditor
              initialContent={initialBlocks}
              onChange={(body_blocks) => save({ body_blocks })}
            />
          </div>
          {error && <p className="mem-edit-error">{error}</p>}
        </main>

        <aside className="mem-edit-aside">
          <section className="set-block">
            <header className="set-head">
              <h2>properties</h2>
            </header>
            <div className="set-body">
              <TypedForm
                type={type}
                fields={(item.fields ?? {}) as never}
                title={item.title ?? undefined}
                onChange={(patch) => save({ fields: patch })}
              />
            </div>
          </section>

          <section className="set-block">
            <header className="set-head">
              <h2>status</h2>
              <span className="set-meta">{item.status}</span>
            </header>
            <div className="set-body mem-status-actions">
              {item.status === "draft" && (
                <button
                  className="btn btn-primary"
                  onClick={() => startTransition(async () => { await publishMemoryItem(item.id); router.refresh(); })}
                >
                  publish
                </button>
              )}
              {item.status !== "archived" && (
                <button
                  className="btn"
                  onClick={() => startTransition(async () => { await archiveMemoryItem(item.id); router.push("/memory"); })}
                >
                  archive
                </button>
              )}
            </div>
          </section>

          <section className="set-block">
            <header className="set-head">
              <h2>relations</h2>
            </header>
            <div className="set-body">
              {relations.outgoing.length === 0 && relations.incoming.length === 0 ? (
                <p className="mem-empty">
                  no links yet. connect this item to others to make it discoverable
                  across the brain.
                </p>
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
              <div className="mem-rel-picker">
                <RelationPicker srcId={item.id} />
              </div>
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
      <Link href={`/memory/${target.id}`} className="mem-rel-link">
        <TypeChip type={target.type} size="xs" />
        <span className="mem-rel-title">{target.title}</span>
      </Link>
    </div>
  );
}
