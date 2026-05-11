"use client";

import { useMemo, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TypeChip } from "@/components/memory/type-chip";
import type { Supertag } from "@/lib/memory/types";
import type { ProposalWithOrigin } from "./source-types";

type Props = {
  proposals: ProposalWithOrigin[];
  onAcceptAll: (final: ProposalWithOrigin[]) => Promise<void> | void;
  onBack: () => void;
  error: string | null;
};

type Row = ProposalWithOrigin & { included: boolean };

const TYPE_ORDER: Supertag[] = [
  "product", "voice", "team", "vendor", "decision",
  "glossary", "skill", "source_artifact", "note",
];

export function ReviewStep({ proposals, onAcceptAll, onBack, error }: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    proposals.map((p) => ({ ...p, included: true })),
  );
  const [pending, start] = useTransition();

  const includedCount = rows.filter((r) => r.included).length;
  const included = useMemo(() => rows.filter((r) => r.included), [rows]);

  const toggle = (i: number) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, included: !r.included } : r)));

  const rename = (i: number, title: string) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, title } : r)));

  const accept = () =>
    start(() =>
      onAcceptAll(
        included.map(({ included: _included, ...rest }) => {
          void _included;
          return rest;
        }),
      ),
    );

  return (
    <section className="space-y-7">
      <div className="space-y-3">
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
          className="text-4xl font-semibold tracking-[-0.025em] text-foreground sm:text-[2.75rem] sm:leading-[1.05]"
        >
          Review what we found.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: [0.2, 0, 0, 1] }}
          className="max-w-xl text-[15px] leading-relaxed text-muted-foreground"
        >
          Uncheck anything that's wrong. Click a title to rename. The rest lands in your brain.
        </motion.p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
        <ul className="space-y-1.5">
          <AnimatePresence initial={true}>
            {rows.map((row, i) => (
              <ProposalRow
                key={`${row.type}-${row.title}-${i}`}
                row={row}
                index={i}
                onToggle={() => toggle(i)}
                onRename={(t) => rename(i, t)}
              />
            ))}
          </AnimatePresence>
        </ul>

        <BrainPreview included={included} total={rows.length} />
      </div>

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
          disabled={pending || includedCount === 0}
          className="group/btn relative inline-flex items-center gap-2 rounded-full bg-brain-accent px-5 py-2.5 text-sm font-medium text-brain-accent-foreground shadow-[0_2px_12px_-2px_color-mix(in_oklch,var(--brain-accent)_50%,transparent),0_0_32px_-12px_color-mix(in_oklch,var(--brain-accent)_70%,transparent)] transition-all duration-200 hover:shadow-[0_4px_20px_-2px_color-mix(in_oklch,var(--brain-accent)_60%,transparent),0_0_44px_-8px_color-mix(in_oklch,var(--brain-accent)_80%,transparent)] hover:-translate-y-[1px] active:translate-y-0 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {pending ? "Adding to your brain…" : `Save ${includedCount} to brain`}
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

function ProposalRow({
  row,
  index,
  onToggle,
  onRename,
}: {
  row: Row;
  index: number;
  onToggle: () => void;
  onRename: (t: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(row.title);

  const commit = () => {
    if (title.trim() && title !== row.title) onRename(title.trim());
    setEditing(false);
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{
        duration: 0.35,
        ease: [0.2, 0, 0, 1],
        delay: Math.min(index * 0.06, 0.4),
      }}
      className={`group relative flex items-start gap-3 rounded-xl border px-4 py-3.5 backdrop-blur-sm transition-all duration-200 ${
        row.included
          ? "border-border/70 bg-card/50 hover:border-foreground/15 hover:bg-card/70 dark:bg-card/40"
          : "border-dashed border-border/50 bg-card/20 opacity-55 hover:opacity-80"
      }`}
    >
      <Checkbox checked={row.included} onChange={onToggle} />

      <div className="min-w-0 flex-1">
        {row._sourceKind && row._sourceLabel && (
          <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground/70">
            <span>from {row._sourceKind}</span>
            <span aria-hidden>·</span>
            <span className="max-w-[16rem] truncate normal-case tracking-normal text-muted-foreground" title={row._sourceLabel}>
              {row._sourceLabel}
            </span>
          </p>
        )}
        <div className="flex items-baseline gap-2.5">
          <TypeChip type={row.type as Supertag} size="sm" className="shrink-0" />
          {editing ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setTitle(row.title);
                  setEditing(false);
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-[14.5px] font-medium tracking-tight outline-none ring-1 ring-ring rounded px-1 -mx-1"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={!row.included}
              className="min-w-0 flex-1 truncate text-left text-[14.5px] font-medium tracking-tight leading-snug text-foreground hover:text-foreground/70 transition-colors disabled:cursor-default"
            >
              {row.title}
            </button>
          )}
        </div>
        {row.body && (
          <p className="mt-1 line-clamp-1 pl-px text-[13px] leading-relaxed text-muted-foreground">
            {row.body}
          </p>
        )}
      </div>
    </motion.li>
  );
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all duration-200 ${
        checked
          ? "border-transparent bg-brain-accent shadow-[0_0_0_1px_color-mix(in_oklch,var(--brain-accent)_60%,transparent),0_0_12px_-2px_color-mix(in_oklch,var(--brain-accent)_55%,transparent)]"
          : "border-border bg-card/40 hover:border-foreground/40"
      }`}
    >
      <AnimatePresence>
        {checked && (
          <motion.svg
            key="tick"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
          >
            <path
              d="M2 5.5 L4.5 8 L9 3"
              stroke="var(--brain-accent-foreground)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </button>
  );
}

function BrainPreview({ included, total }: { included: Row[]; total: number }) {
  const grouped = useMemo(() => {
    const m = new Map<Supertag, Row[]>();
    for (const r of included) {
      const t = r.type as Supertag;
      const arr = m.get(t) ?? [];
      arr.push(r);
      m.set(t, arr);
    }
    return TYPE_ORDER
      .map((t) => ({ type: t, items: m.get(t) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [included]);

  const sourceCounts = useMemo(() => {
    const seen = new Set<string>();
    const counts = { url: 0, file: 0, text: 0 } as Record<"url" | "file" | "text", number>;
    for (const r of included) {
      if (!r._sourceId || !r._sourceKind) {
        counts.text = 1; // textarea contributed at least once
        continue;
      }
      if (seen.has(r._sourceId)) continue;
      seen.add(r._sourceId);
      counts[r._sourceKind] = (counts[r._sourceKind] ?? 0) + 1;
    }
    return counts;
  }, [included]);

  const sourcesLabel = useMemo(() => {
    const parts: string[] = [];
    if (sourceCounts.text) parts.push("paste");
    if (sourceCounts.url) parts.push(`${sourceCounts.url} URL${sourceCounts.url === 1 ? "" : "s"}`);
    if (sourceCounts.file) parts.push(`${sourceCounts.file} file${sourceCounts.file === 1 ? "" : "s"}`);
    if (parts.length === 0) return null;
    return parts.join(" + ");
  }, [sourceCounts]);

  return (
    <motion.aside
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.18, ease: [0.2, 0, 0, 1] }}
      className="hidden lg:block"
    >
      <div className="sticky top-10 overflow-hidden rounded-2xl border border-border/70 bg-card/40 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_40px_-16px_rgba(0,0,0,0.18)] backdrop-blur-md dark:bg-card/30">
        <div className="flex items-baseline justify-between border-b border-border/40 px-5 pt-4 pb-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
            Your brain
          </p>
          <motion.p
            key={included.length}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="text-[11px] tabular-nums text-muted-foreground"
          >
            {included.length} of {total}
          </motion.p>
        </div>

        {grouped.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[12px] leading-relaxed text-muted-foreground/70">
              Check items on the left to see them here.
            </p>
          </div>
        ) : (
          <>
          <ul className="max-h-[24rem] divide-y divide-border/40 overflow-y-auto px-1 py-1">
            <AnimatePresence initial={false}>
              {grouped.map((g) => (
                <motion.li
                  layout
                  key={g.type}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
                  className="px-4 py-3"
                >
                  <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-brain-accent/90">
                    {g.type} · {g.items.length}
                  </p>
                  <ul className="space-y-0.5">
                    <AnimatePresence initial={false}>
                      {g.items.map((it, i) => (
                        <motion.li
                          layout
                          key={`${it.title}-${i}`}
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 4 }}
                          transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
                          className="truncate text-[13px] leading-relaxed text-foreground/85"
                        >
                          {it.title}
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {sourcesLabel && (
            <div className="border-t border-border/40 px-5 py-2.5">
              <p className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground/70">
                Drawn from {sourcesLabel}
              </p>
            </div>
          )}
          </>
        )}
      </div>
    </motion.aside>
  );
}

