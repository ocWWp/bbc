"use client";

import { motion } from "framer-motion";
import { useTransition } from "react";
import { TypeChip } from "@/components/memory/type-chip";
import { SUPERTAGS, supertagMeta, type Supertag } from "@/lib/memory/types";
import { createBlankItem } from "../actions";

export function TypePicker() {
  const [pending, start] = useTransition();
  return (
    <motion.div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
    >
      {SUPERTAGS.map((t) => (
        <motion.button
          key={t}
          type="button"
          disabled={pending}
          variants={{
            hidden: { opacity: 0, y: 8 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.2, 0, 0, 1] } },
          }}
          whileHover={{ y: -2, scale: 1.005 }}
          whileTap={{ scale: 0.99 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          onClick={() => start(() => { void createBlankItem(t as Supertag); })}
          className="group relative flex items-start gap-4 rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:border-foreground/30 hover:shadow-md disabled:opacity-60"
        >
          <TypeChip type={t} size="md" />
          <div className="min-w-0 flex-1">
            <div className="text-base font-medium leading-tight">{supertagMeta[t].label}</div>
            <div className="mt-0.5 text-sm text-muted-foreground">{supertagMeta[t].hint}</div>
          </div>
          <span className="self-center text-muted-foreground/50 transition-transform group-hover:translate-x-0.5">→</span>
        </motion.button>
      ))}
    </motion.div>
  );
}
