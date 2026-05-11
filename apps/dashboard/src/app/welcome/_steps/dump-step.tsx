"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

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
    <section className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Tell us about your product.</h1>
        <p className="text-base text-muted-foreground">
          Voice, team, decisions, vendors — anything that should live in your shared brain. Don't overthink it.
        </p>
      </div>

      <div className="relative">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={14}
          className="w-full resize-none rounded-xl border bg-card px-4 py-3.5 text-[15px] leading-relaxed shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
          aria-label="Brain dump"
        />
        {!value && (
          <div className="pointer-events-none absolute inset-x-4 top-3.5 select-none">
            <AnimatePresence mode="wait">
              <motion.p
                key={idx}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
                className="text-[15px] leading-relaxed text-muted-foreground/50"
              >
                {PLACEHOLDERS[idx]}
              </motion.p>
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
            <motion.div
              initial={false}
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.3 }}
              className={`h-full ${canSubmit ? "bg-brain-accent" : "bg-muted-foreground/40"}`}
            />
          </div>
          <span className="tabular-nums">
            {len}/{MAX}
          </span>
          {len > 0 && len < MIN && (
            <span className="text-muted-foreground/70">— at least {MIN}</span>
          )}
        </div>

        <Button
          type="button"
          variant="brain"
          size="lg"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="group"
        >
          Structure my brain
          <span className="ml-1.5 transition-transform group-hover:translate-x-0.5">→</span>
        </Button>
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
