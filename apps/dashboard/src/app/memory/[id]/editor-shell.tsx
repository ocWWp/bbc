"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PartialBlock } from "@blocknote/core";
import { BlockEditor } from "@/components/memory/block-editor";
import { TypedForm } from "@/components/memory/typed-form";
import { TypeChip } from "@/components/memory/type-chip";
import { Button } from "@/components/ui/button";
import { archiveMemoryItem, publishMemoryItem, updateMemoryItem } from "../actions";
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
    <div className="-mx-6 -mt-6 min-h-[calc(100vh-3rem)] grid grid-cols-1 lg:grid-cols-[1fr_360px]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="px-8 py-8 lg:px-16 lg:py-12"
      >
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center gap-3 text-xs">
            <Link href="/memory" className="text-muted-foreground hover:text-foreground transition-colors">
              ← Memory
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <TypeChip type={type} size="xs" />
            <AnimatePresence>
              {saveState !== "idle" && (
                <motion.span
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="ml-auto text-muted-foreground/70"
                >
                  {saveState === "saving" && "Saving…"}
                  {saveState === "saved" && "Saved"}
                  {saveState === "error" && <span className="text-rose-500">Save failed</span>}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <input
            defaultValue={item.title ?? ""}
            placeholder="Untitled"
            onChange={(e) => save({ title: e.target.value })}
            className="w-full bg-transparent text-4xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/40"
          />

          <BlockEditor
            initialContent={initialBlocks}
            onChange={(body_blocks) => save({ body_blocks })}
          />

          {error && <p className="text-sm text-rose-500">{error}</p>}
        </div>
      </motion.div>

      <motion.aside
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: 0.05, ease: [0.2, 0, 0, 1] }}
        className="border-l bg-muted/20 px-6 py-8 lg:py-12 space-y-6 lg:sticky lg:top-0 lg:h-[calc(100vh-3rem)] lg:overflow-y-auto"
      >
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Properties
          </h2>
          <TypedForm
            type={type}
            fields={(item.fields ?? {}) as never}
            onChange={(patch) => save({ fields: patch })}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Status
          </h2>
          <div className="flex flex-wrap gap-2">
            {item.status === "draft" && (
              <Button
                size="sm"
                variant="brain"
                onClick={() => startTransition(async () => { await publishMemoryItem(item.id); router.refresh(); })}
              >
                Publish
              </Button>
            )}
            {item.status !== "archived" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => startTransition(async () => { await archiveMemoryItem(item.id); router.push("/memory"); })}
              >
                Archive
              </Button>
            )}
            <span className="self-center text-xs text-muted-foreground capitalize">{item.status}</span>
          </div>
        </section>

        <RelationsPanel itemId={item.id} relations={relations} />
      </motion.aside>
    </div>
  );
}

function RelationsPanel({ itemId, relations }: { itemId: string; relations: Relations }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Relations
      </h2>

      {relations.outgoing.length === 0 && relations.incoming.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">
          No links yet. Connect this item to others to make it discoverable across the brain.
        </p>
      ) : (
        <div className="space-y-3">
          {relations.outgoing.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60">Outgoing</div>
              {relations.outgoing.map((r) => (
                <RelationRow key={r.id} kind={r.kind} target={r.dst} direction="out" />
              ))}
            </div>
          )}
          {relations.incoming.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60">Backlinks</div>
              {relations.incoming.map((r) => (
                <RelationRow key={r.id} kind={r.kind} target={r.src} direction="in" />
              ))}
            </div>
          )}
        </div>
      )}

      <RelationPickerDynamic srcId={itemId} />
    </section>
  );
}

function RelationRow({
  kind,
  target,
  direction,
}: {
  kind: RelationKind;
  target: { id: string; type: Supertag; title: string; slug: string } | null;
  direction: "in" | "out";
}) {
  if (!target) return null;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: direction === "out" ? -6 : 6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="group flex items-center gap-2"
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60 w-20 shrink-0">
        {kind}
      </span>
      <Link
        href={`/memory/${target.id}`}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-background"
      >
        <TypeChip type={target.type} size="xs" />
        <span className="truncate text-sm">{target.title}</span>
      </Link>
    </motion.div>
  );
}

import { RelationPicker } from "@/components/memory/relation-picker";

function RelationPickerDynamic({ srcId }: { srcId: string }) {
  return <RelationPicker srcId={srcId} />;
}
