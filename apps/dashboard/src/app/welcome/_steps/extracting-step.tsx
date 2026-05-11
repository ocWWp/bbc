"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const PHASES = [
  "Reading your brain",
  "Identifying patterns",
  "Structuring memory",
];

const WORD = "Structuring";

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
    <section className="flex flex-col items-center justify-center gap-10 py-20 text-center">
      <div className="relative">
        {/* Breathing accent disc */}
        <div
          className="absolute left-1/2 top-1/2 -z-10 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brain-accent/20 blur-3xl"
          style={{ animation: "bbc-breath 2.4s ease-in-out infinite" }}
        />
        {/* Letter wave */}
        <div className="flex select-none gap-[2px] font-medium text-3xl tracking-[-0.02em] text-foreground">
          {WORD.split("").map((ch, i) => (
            <span
              key={`${ch}-${i}`}
              className="inline-block"
              style={{
                animation: `bbc-letter-wave 1.6s ease-in-out infinite`,
                animationDelay: `${i * 0.08}s`,
              }}
            >
              {ch}
            </span>
          ))}
          <span
            className="inline-block"
            style={{
              animation: `bbc-letter-wave 1.6s ease-in-out infinite`,
              animationDelay: `${WORD.length * 0.08}s`,
            }}
          >
            …
          </span>
        </div>
        {/* Subtle scanning underline */}
        <div className="relative mt-4 h-px w-48 overflow-hidden rounded-full bg-border">
          <div
            className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-brain-accent to-transparent"
            style={{ animation: "bbc-scan 1.8s ease-in-out infinite" }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={phase}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
          className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground"
        >
          {PHASES[phase]}
        </motion.p>
      </AnimatePresence>
    </section>
  );
}
