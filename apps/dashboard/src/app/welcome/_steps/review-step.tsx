"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
    <section className="space-y-7">
      <div className="space-y-3">
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
          className="text-5xl font-semibold tracking-[-0.025em] text-foreground"
        >
          We structured{" "}
          <span className="relative inline-block">
            <motion.span
              key={items.length}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
              className="relative z-10 inline-block tabular-nums text-brain-accent-foreground"
              style={{
                background: "var(--brain-accent)",
                padding: "0 0.18em",
                borderRadius: "0.18em",
                boxShadow: "0 0 32px -8px color-mix(in oklch, var(--brain-accent) 70%, transparent)",
              }}
            >
              {items.length}
            </motion.span>
          </span>{" "}
          {items.length === 1 ? "item" : "items"}.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: [0.2, 0, 0, 1] }}
          className="text-[15px] leading-relaxed text-muted-foreground max-w-xl"
        >
          Click any title to rename. Dismiss anything that's wrong. The rest land in your brain in one click.
        </motion.p>
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
          className="rounded-xl border border-dashed border-border/70 py-14 text-center"
        >
          <p className="text-sm text-muted-foreground">
            All dismissed. Go back and add more detail.
          </p>
        </motion.div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={pending}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={accept}
          disabled={pending || items.length === 0}
          className="group/btn relative inline-flex items-center gap-2 rounded-full bg-brain-accent px-5 py-2.5 text-sm font-medium text-brain-accent-foreground shadow-[0_2px_12px_-2px_color-mix(in_oklch,var(--brain-accent)_50%,transparent),0_0_32px_-12px_color-mix(in_oklch,var(--brain-accent)_70%,transparent)] transition-all duration-200 hover:shadow-[0_4px_20px_-2px_color-mix(in_oklch,var(--brain-accent)_60%,transparent),0_0_44px_-8px_color-mix(in_oklch,var(--brain-accent)_80%,transparent)] hover:-translate-y-[1px] active:translate-y-0 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {pending ? "Adding to your brain…" : `Accept ${items.length}`}
          {!pending && (
            <span className="transition-transform duration-200 group-hover/btn:translate-x-0.5">→</span>
          )}
        </button>
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
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -24, scale: 0.95 }}
      transition={{
        duration: 0.4,
        ease: [0.2, 0, 0, 1],
        delay: Math.min(index * 0.08, 0.6),
      }}
      className="group relative overflow-hidden rounded-xl border border-border/70 bg-card/50 px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_-8px_rgba(0,0,0,0.08)] backdrop-blur-sm transition-all duration-200 hover:border-foreground/20 hover:shadow-[0_2px_6px_rgba(0,0,0,0.06),0_8px_24px_-8px_rgba(0,0,0,0.12)] hover:-translate-y-[1px] dark:bg-card/40 dark:hover:bg-card/60"
    >
      {/* Subtle hover gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: "radial-gradient(60% 80% at 50% 0%, color-mix(in oklch, var(--brain-accent) 5%, transparent) 0%, transparent 70%)",
        }}
      />
      <div className="relative flex items-start gap-3.5">
        <TypeChip type={proposal.type as Supertag} size="sm" className="mt-0.5 shrink-0" />
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
              className="w-full bg-transparent text-[15px] font-medium tracking-tight outline-none ring-1 ring-ring rounded px-1 -mx-1"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="w-full text-left text-[15px] font-medium tracking-tight leading-snug hover:text-foreground/80 transition-colors"
            >
              {proposal.title}
            </button>
          )}
          {proposal.body && (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground line-clamp-2">{proposal.body}</p>
          )}
          <FieldsPreview type={proposal.type as Supertag} fields={proposal.fields as Record<string, unknown>} />
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 opacity-0 transition-all group-hover:opacity-60 hover:!opacity-100 hover:bg-muted text-muted-foreground"
        >
          <span className="block text-lg leading-none">×</span>
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
      highlights.push(`avoids "${(fields.dont_words as string[]).slice(0, 2).join(", ")}"`);
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
    <div className="mt-2 flex flex-wrap gap-1.5">
      {highlights.map((h, i) => (
        <span key={i} className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[11px] text-muted-foreground/90">
          {h}
        </span>
      ))}
    </div>
  );
}
