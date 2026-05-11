"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const PHASES = [
  "Reading your brain…",
  "Identifying patterns…",
  "Almost there…",
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
    <section className="flex flex-col items-center justify-center gap-6 py-24 text-center">
      <Shimmer />
      <AnimatePresence mode="wait">
        <motion.p
          key={phase}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
          className="text-base text-muted-foreground"
        >
          {PHASES[phase]}
        </motion.p>
      </AnimatePresence>
    </section>
  );
}

function Shimmer() {
  return (
    <div className="relative h-16 w-16">
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-brain-accent/30"
        animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-2 rounded-full border-2 border-brain-accent/50"
        animate={{ scale: [1, 1.15, 1], opacity: [0.8, 0, 0.8] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
      />
      <motion.div
        className="absolute inset-5 rounded-full bg-brain-accent"
        animate={{ scale: [1, 0.85, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
