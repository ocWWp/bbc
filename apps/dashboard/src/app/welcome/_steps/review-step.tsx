"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { TypeChip } from "@/components/memory/type-chip";
import type { Proposal } from "@/lib/memory/extractor/types";
import type { Supertag } from "@/lib/memory/types";

type Props = {
  proposals: Proposal[];
  onAcceptAll: (final: Proposal[]) => Promise<void> | void;
  onBack: () => void;
  error: string | null;
};

export function ReviewStep({ proposals, onAcceptAll, onBack, error }: Props) {
  const [items, setItems] = useState<Proposal[]>(proposals);
  const [pending, start] = useTransition();

  const updateTitle = (i: number, title: string) =>
    setItems((prev) => prev.map((p, j) => (j === i ? { ...p, title } : p)));

  const dismiss = (i: number) => setItems((prev) => prev.filter((_, j) => j !== i));

  const accept = () => start(() => onAcceptAll(items));

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">
          We found{" "}
          <motion.span
            key={items.length}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
            className="inline-block tabular-nums text-brain-accent-foreground bg-brain-accent rounded-md px-2"
          >
            {items.length}
          </motion.span>{" "}
          {items.length === 1 ? "item" : "items"}.
        </h1>
        <p className="text-base text-muted-foreground">
          Edit titles inline. Dismiss anything that's wrong. Then accept the rest in one click.
        </p>
      </div>

      <motion.ul layout className="space-y-2">
        <AnimatePresence initial={true}>
          {items.map((p, i) => (
            <ProposalCard
              key={`${p.type}-${p.title}-${i}`}
              proposal={p}
              index={i}
              onRename={(t) => updateTitle(i, t)}
              onDismiss={() => dismiss(i)}
            />
          ))}
        </AnimatePresence>
      </motion.ul>

      {items.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border border-dashed py-12 text-center"
        >
          <p className="text-sm text-muted-foreground">
            All dismissed. Go back and add more detail, or accept zero to skip.
          </p>
        </motion.div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={pending}>
          ← Back
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="brain"
            size="lg"
            onClick={accept}
            disabled={pending || items.length === 0}
            className="group"
          >
            {pending ? "Adding to your brain…" : `Accept ${items.length}`}
            {!pending && (
              <span className="ml-1.5 transition-transform group-hover:translate-x-0.5">→</span>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
        >
          {error}
        </motion.div>
      )}
    </section>
  );
}

function ProposalCard({
  proposal,
  index,
  onRename,
  onDismiss,
}: {
  proposal: Proposal;
  index: number;
  onRename: (t: string) => void;
  onDismiss: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(proposal.title);

  const commit = () => {
    if (title.trim() && title !== proposal.title) onRename(title.trim());
    setEditing(false);
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -20, scale: 0.95 }}
      transition={{
        duration: 0.35,
        ease: [0.2, 0, 0, 1],
        delay: Math.min(index * 0.08, 0.6),
      }}
      className="group rounded-xl border bg-card px-4 py-3 shadow-sm transition-all hover:border-foreground/20 hover:shadow"
    >
      <div className="flex items-start gap-3">
        <TypeChip type={proposal.type as Supertag} size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setTitle(proposal.title);
                  setEditing(false);
                }
              }}
              className="w-full bg-transparent text-[15px] font-medium outline-none ring-1 ring-ring rounded px-1 -mx-1"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="w-full text-left text-[15px] font-medium leading-snug hover:text-foreground/80 transition-colors"
            >
              {proposal.title}
            </button>
          )}
          {proposal.body && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{proposal.body}</p>
          )}
          <FieldsPreview type={proposal.type as Supertag} fields={proposal.fields as Record<string, unknown>} />
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 text-muted-foreground"
        >
          ×
        </button>
      </div>
    </motion.li>
  );
}

function FieldsPreview({ type, fields }: { type: Supertag; fields: Record<string, unknown> }) {
  const highlights: string[] = [];
  if (type === "voice") {
    if (fields.register) highlights.push(`${fields.register}`);
    if (Array.isArray(fields.dont_words) && fields.dont_words.length > 0) {
      highlights.push(`avoids ${(fields.dont_words as string[]).slice(0, 3).join(", ")}`);
    }
  } else if (type === "vendor") {
    if (fields.role) highlights.push(`${fields.role}`);
    if (fields.status) highlights.push(`${fields.status}`);
  } else if (type === "team") {
    if (fields.role) highlights.push(`${fields.role}`);
    if (fields.email) highlights.push(`${fields.email}`);
  } else if (type === "decision") {
    if (fields.status) highlights.push(`${fields.status}`);
    if (fields.date) highlights.push(`${fields.date}`);
  } else if (type === "product") {
    if (fields.target_user) highlights.push(`for ${fields.target_user}`);
  }
  if (highlights.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {highlights.map((h, i) => (
        <span key={i} className="text-[11px] text-muted-foreground/80 bg-muted rounded px-1.5 py-0.5">
          {h}
        </span>
      ))}
    </div>
  );
}
