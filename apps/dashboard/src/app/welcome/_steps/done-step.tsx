"use client";

import Link from "next/link";
import { motion } from "framer-motion";

type Props = {
  count: number;
  firstId: string | null;
  tenantSlug: string;
};

export function DoneStep({ count, firstId, tenantSlug }: Props) {
  return (
    <section className="flex flex-col items-center gap-7 py-14 text-center">
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.05 }}
        className="relative"
      >
        {/* Outer glow */}
        <motion.div
          initial={{ scale: 1, opacity: 0 }}
          animate={{ scale: [1, 1.8], opacity: [0.7, 0] }}
          transition={{ duration: 1.4, repeat: 1, repeatDelay: 0.4, ease: "easeOut" }}
          className="absolute inset-0 rounded-full bg-brain-accent blur-2xl"
        />
        {/* Disc */}
        <div
          className="relative grid h-20 w-20 place-items-center rounded-full bg-brain-accent"
          style={{
            boxShadow: "0 8px 32px -8px color-mix(in oklch, var(--brain-accent) 60%, transparent), 0 0 48px -8px color-mix(in oklch, var(--brain-accent) 50%, transparent)",
          }}
        >
          <svg viewBox="0 0 24 24" className="h-10 w-10 text-brain-accent-foreground" fill="none" stroke="currentColor" strokeWidth="2.5">
            <motion.path
              d="M5 12.5l4.5 4.5L19 7"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.45, delay: 0.35, ease: [0.65, 0, 0.35, 1] }}
            />
          </svg>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.45, ease: [0.2, 0, 0, 1] }}
        className="space-y-2"
      >
        <h1 className="text-4xl font-semibold tracking-[-0.025em]">Your brain is alive.</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground max-w-md">
          {count} {count === 1 ? "item is" : "items are"} now in{" "}
          <span className="font-mono text-[13px] text-foreground bg-muted px-1.5 py-0.5 rounded">{tenantSlug}</span> — readable by every agent that touches your product.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6, ease: [0.2, 0, 0, 1] }}
        className="flex flex-col gap-2 sm:flex-row pt-1"
      >
        <Link
          href="/memory"
          className="group/btn inline-flex items-center gap-2 rounded-full bg-brain-accent px-5 py-2.5 text-sm font-medium text-brain-accent-foreground shadow-[0_2px_12px_-2px_color-mix(in_oklch,var(--brain-accent)_50%,transparent),0_0_32px_-12px_color-mix(in_oklch,var(--brain-accent)_70%,transparent)] transition-all duration-200 hover:shadow-[0_4px_20px_-2px_color-mix(in_oklch,var(--brain-accent)_60%,transparent),0_0_44px_-8px_color-mix(in_oklch,var(--brain-accent)_80%,transparent)] hover:-translate-y-[1px]"
        >
          Open my brain
          <span className="transition-transform group-hover/btn:translate-x-0.5">→</span>
        </Link>
        {firstId && (
          <Link
            href={`/memory/${firstId}`}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-border/80 bg-background px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            See the first item
          </Link>
        )}
      </motion.div>
    </section>
  );
}
