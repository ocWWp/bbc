"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const PHASES = [
  "Reading your brain",
  "Identifying patterns",
  "Structuring memory",
];

export function ExtractingStep() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const phaseMs = 2300;
    const t1 = setTimeout(() => setPhase(1), phaseMs);
    const t2 = setTimeout(() => setPhase(2), phaseMs * 2);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <section className="flex flex-col items-center justify-center gap-8 py-24 text-center">
      <div className="relative">
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 -z-10 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brain-accent/15 blur-3xl"
          style={{ animation: "bbc-breath 2.6s ease-in-out infinite" }}
        />
        <Spinner />
      </div>

      <div className="space-y-2.5">
        <AnimatePresence mode="wait">
          <motion.p
            key={phase}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
            className="font-mono text-[11px] uppercase tracking-[0.22em] text-foreground"
          >
            {PHASES[phase]}
          </motion.p>
        </AnimatePresence>
        <p className="text-[12px] text-muted-foreground/70">
          This can take up to 10 seconds
        </p>
      </div>

      <div className="mt-1 flex items-center gap-1.5">
        {PHASES.map((_, i) => (
          <span
            key={i}
            className={`h-px w-6 transition-all duration-500 ${
              i <= phase ? "bg-brain-accent" : "bg-border"
            }`}
          />
        ))}
      </div>
    </section>
  );
}

function Spinner() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      className="text-foreground"
      style={{ animation: "bbc-spinner-rotate 1.2s linear infinite" }}
    >
      <circle
        cx="14"
        cy="14"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.12"
        strokeWidth="1.5"
      />
      <path
        d="M14 4 a10 10 0 0 1 9.4 6.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
