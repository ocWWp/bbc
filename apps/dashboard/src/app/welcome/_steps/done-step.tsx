"use client";

import Link from "next/link";
import { useMemo } from "react";
import { motion } from "framer-motion";
import type { Proposal } from "@/lib/memory/extractor/types";
import type { Supertag } from "@/lib/memory/types";

type Props = {
  count: number;
  firstId: string | null;
  tenantSlug: string;
  proposals: Proposal[];
};

const TYPE_ORDER: Supertag[] = ["product", "voice", "team", "vendor", "decision"];

export function DoneStep({ count, firstId, tenantSlug, proposals }: Props) {
  const grouped = useMemo(() => {
    const m = new Map<Supertag, Proposal[]>();
    for (const p of proposals) {
      const t = p.type as Supertag;
      const arr = m.get(t) ?? [];
      arr.push(p);
      m.set(t, arr);
    }
    return TYPE_ORDER
      .map((t) => ({ type: t, items: m.get(t) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [proposals]);

  return (
    <section className="flex flex-col items-center gap-8 py-10 text-center">
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.05 }}
        className="relative"
      >
        <motion.div
          initial={{ scale: 1, opacity: 0 }}
          animate={{ scale: [1, 1.8], opacity: [0.7, 0] }}
          transition={{ duration: 1.4, repeat: 1, repeatDelay: 0.4, ease: "easeOut" }}
          className="absolute inset-0 rounded-full bg-brain-accent blur-2xl"
        />
        <div
          className="relative grid h-16 w-16 place-items-center rounded-full bg-brain-accent"
          style={{
            boxShadow: "0 8px 32px -8px color-mix(in oklch, var(--brain-accent) 60%, transparent), 0 0 48px -8px color-mix(in oklch, var(--brain-accent) 50%, transparent)",
          }}
        >
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-brain-accent-foreground" fill="none" stroke="currentColor" strokeWidth="2.5">
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
        transition={{ duration: 0.4, delay: 0.4, ease: [0.2, 0, 0, 1] }}
        className="space-y-2.5 max-w-md"
      >
        <h1 className="text-4xl font-semibold tracking-[-0.025em] sm:text-[2.5rem]">
          Your brain is alive.
        </h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {count} {count === 1 ? "item is" : "items are"} now in{" "}
          <span className="font-mono text-[13px] text-foreground bg-muted px-1.5 py-0.5 rounded">{tenantSlug}</span> — readable by every agent that touches your product.
        </p>
      </motion.div>

      {grouped.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.55, ease: [0.2, 0, 0, 1] }}
          className="w-full max-w-xl text-left"
        >
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/40 backdrop-blur-md dark:bg-card/30">
            <div className="border-b border-border/40 px-5 pt-4 pb-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
                What landed in your brain
              </p>
            </div>
            <ul className="divide-y divide-border/40">
              {grouped.map((g, gi) => (
                <motion.li
                  key={g.type}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: 0.65 + gi * 0.06, ease: [0.2, 0, 0, 1] }}
                  className="px-5 py-3"
                >
                  <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-brain-accent/90">
                    {g.type} · {g.items.length}
                  </p>
                  <ul className="space-y-0.5">
                    {g.items.map((it, i) => (
                      <li
                        key={`${it.title}-${i}`}
                        className="truncate text-[13.5px] leading-relaxed text-foreground/85"
                      >
                        {it.title}
                      </li>
                    ))}
                  </ul>
                </motion.li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.85, ease: [0.2, 0, 0, 1] }}
        className="flex flex-col gap-2 sm:flex-row"
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

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 1.0, ease: [0.2, 0, 0, 1] }}
        className="mt-4 w-full max-w-xl text-left"
      >
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 text-center">
          What you can do with this brain
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <NextStep
            href="/studio/marketing"
            label="Marketing Studio"
            description="Draft X posts, threads, blog posts — in your voice with citations."
          />
          <NextStep
            href="/studio/engineering"
            label="Engineering Studio"
            description="Draft ADRs, vendor swap proposals, tech-debt reviews."
          />
          <NextStep
            href="/studio/founder"
            label="Founder Studio"
            description="Strategic memos, board updates, weekly recaps."
          />
          <NextStep
            href="/studio/designer"
            label="Designer Studio"
            description="Visual specs, brand guideline entries, UI copy passes."
          />
          <NextStep
            href="/api-keys"
            label="Wire your agents"
            description="MCP server + REST shim. Bearer-auth from /api-keys."
          />
          <NextStep
            href="/studio"
            label="Browse all studios"
            description="One index for every role agent, with recent runs."
          />
        </div>
      </motion.div>
    </section>
  );
}

function NextStep({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group/step rounded-xl border border-border/70 bg-card/40 backdrop-blur-md dark:bg-card/30 px-4 py-3 transition-colors hover:bg-card/70 dark:hover:bg-card/50"
    >
      <div className="text-[13.5px] font-medium text-foreground">
        {label}
        <span className="ml-1 text-muted-foreground/70 transition-transform inline-block group-hover/step:translate-x-0.5">→</span>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
        {description}
      </p>
    </Link>
  );
}
