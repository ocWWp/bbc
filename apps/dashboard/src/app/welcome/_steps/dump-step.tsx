"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const PLACEHOLDERS = [
  "We're a developer-tools startup helping early-stage founders ship product faster. Our voice is direct and lowercase — we never use the word 'leverage' or 'synergy'. The team is Sarah (PM), Alex (eng), Mei (design)...",
  "Our product is a memory layer for AI agents. We picked Supabase for the database because of Row-Level Security. Competitors are Mem0 and Letta. Founders are our target user, not enterprises...",
  "We sound casual and curious. The team uses Slack, GitHub, and Linear. Our key decision last month: stop pretending we'll ever support self-hosted on-prem — we're SaaS-only.",
];

const MIN = 80;
const SWEET = 700;
const MAX = 8000;

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  error: string | null;
};

export function DumpStep({ value, onChange, onSubmit, error }: Props) {
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    if (value) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % PLACEHOLDERS.length), 5500);
    return () => clearInterval(t);
  }, [value]);

  const len = value.length;
  const canSubmit = len >= MIN && len <= MAX;
  const progress = Math.min(1, len / SWEET);

  return (
    <section className="space-y-7">
      <div className="space-y-3">
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05, ease: [0.2, 0, 0, 1] }}
          className="text-5xl font-semibold tracking-[-0.025em] text-foreground"
        >
          Tell us about your product.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12, ease: [0.2, 0, 0, 1] }}
          className="text-[15px] leading-relaxed text-muted-foreground max-w-xl"
        >
          Voice, team, decisions, vendors — anything that should live in your shared brain. Don't overthink it.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.18, ease: [0.2, 0, 0, 1] }}
        className="relative group"
      >
        {/* Soft glow that intensifies on focus */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-xl bg-gradient-to-br from-brain-accent/0 via-brain-accent/0 to-brain-accent/0 opacity-0 transition-opacity duration-500 group-focus-within:from-brain-accent/15 group-focus-within:to-brain-accent/5 group-focus-within:opacity-100 blur-sm"
        />
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={13}
          className="relative w-full resize-none rounded-xl border border-border/80 bg-card/60 px-5 py-4 text-[15px] leading-relaxed shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_2px_4px_-2px_rgba(0,0,0,0.08)] backdrop-blur-sm transition-all duration-300 placeholder:text-muted-foreground/50 focus:outline-none focus:border-brain-accent/40 focus:bg-card/80 focus:shadow-[0_0_0_1px_color-mix(in_oklch,var(--brain-accent)_30%,transparent),0_8px_28px_-12px_color-mix(in_oklch,var(--brain-accent)_25%,transparent)] dark:bg-card/40 dark:focus:bg-card/60"
          aria-label="Brain dump"
        />
        {!value && (
          <div className="pointer-events-none absolute inset-x-5 top-4 select-none">
            <AnimatePresence mode="wait">
              <motion.p
                key={idx}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.45, ease: [0.2, 0, 0, 1] }}
                className="text-[15px] leading-relaxed text-muted-foreground/70 dark:text-muted-foreground/60"
              >
                {PLACEHOLDERS[idx]}
              </motion.p>
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="relative h-1 w-32 overflow-hidden rounded-full bg-muted">
            <motion.div
              initial={false}
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
              className={canSubmit
                ? "h-full bg-brain-accent shadow-[0_0_12px_color-mix(in_oklch,var(--brain-accent)_60%,transparent)]"
                : "h-full bg-muted-foreground/40"}
            />
          </div>
          <span className="tabular-nums font-medium">
            <span className={canSubmit ? "text-foreground" : ""}>{len}</span>
            <span className="text-muted-foreground/60"> / {MAX}</span>
          </span>
          {len > 0 && len < MIN && (
            <span className="text-muted-foreground/60">— need {MIN - len} more</span>
          )}
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="group/btn relative inline-flex items-center gap-2 rounded-full bg-brain-accent px-5 py-2.5 text-sm font-medium text-brain-accent-foreground shadow-[0_2px_12px_-2px_color-mix(in_oklch,var(--brain-accent)_50%,transparent),0_0_32px_-12px_color-mix(in_oklch,var(--brain-accent)_70%,transparent)] transition-all duration-200 hover:shadow-[0_4px_20px_-2px_color-mix(in_oklch,var(--brain-accent)_60%,transparent),0_0_44px_-8px_color-mix(in_oklch,var(--brain-accent)_80%,transparent)] hover:-translate-y-[1px] active:translate-y-0 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          Structure my brain
          <span className="transition-transform duration-200 group-hover/btn:translate-x-0.5">→</span>
        </button>
      </motion.div>

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
