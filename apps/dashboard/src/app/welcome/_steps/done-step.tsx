"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

type Props = {
  count: number;
  firstId: string | null;
  tenantSlug: string;
};

export function DoneStep({ count, firstId, tenantSlug }: Props) {
  return (
    <section className="flex flex-col items-center gap-6 py-12 text-center">
      <motion.div
        initial={{ scale: 0.4, opacity: 0, rotate: -20 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.05 }}
        className="relative grid h-20 w-20 place-items-center rounded-full bg-brain-accent shadow-lg"
      >
        <motion.div
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 1.8, opacity: 0 }}
          transition={{ duration: 1.2, repeat: 1, repeatDelay: 0.3 }}
          className="absolute inset-0 rounded-full bg-brain-accent"
        />
        <svg viewBox="0 0 24 24" className="relative h-10 w-10 text-brain-accent-foreground" fill="none" stroke="currentColor" strokeWidth="2.5">
          <motion.path
            d="M5 12.5l4.5 4.5L19 7"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.3, ease: [0.65, 0, 0.35, 1] }}
          />
        </svg>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.4, ease: [0.2, 0, 0, 1] }}
        className="space-y-2"
      >
        <h1 className="text-3xl font-semibold tracking-tight">Your brain is alive.</h1>
        <p className="text-base text-muted-foreground">
          {count} {count === 1 ? "item is" : "items are"} now in <span className="font-mono text-sm">{tenantSlug}</span> — readable by every agent that touches your product.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.55 }}
        className="flex flex-col gap-2 sm:flex-row pt-2"
      >
        <Button asChild variant="brain" size="lg" className="group">
          <Link href="/memory">
            Open my brain
            <span className="ml-1.5 transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
        </Button>
        {firstId && (
          <Button asChild variant="outline" size="lg">
            <Link href={`/memory/${firstId}`}>See the first item</Link>
          </Button>
        )}
      </motion.div>
    </section>
  );
}
