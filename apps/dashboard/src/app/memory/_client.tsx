"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TypeChip } from "@/components/memory/type-chip";
import type { Database } from "@/lib/supabase/database.types";

type Row = Pick<
  Database["public"]["Tables"]["memory_files"]["Row"],
  "id" | "type" | "title" | "slug" | "status" | "updated_at" | "fields"
>;

export function MemoryListAnimated({ items }: { items: Row[] }) {
  if (items.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-dashed py-16 text-center"
      >
        <p className="text-sm text-muted-foreground">No items yet.</p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Start with a voice or a decision — both compound fast.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.ul layout className="-mx-3">
      <AnimatePresence initial={true}>
        {items.map((it, i) => (
          <motion.li
            key={it.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.2), ease: [0.2, 0, 0, 1] }}
          >
            <Link
              href={`/memory/${it.id}`}
              className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/60"
            >
              {it.type && <TypeChip type={it.type as never} size="xs" />}
              <span className="flex-1 truncate font-medium">
                {it.title ?? "Untitled"}
              </span>
              {it.status === "draft" && (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  Draft
                </span>
              )}
              <time className="text-xs text-muted-foreground/80 tabular-nums">
                {formatRelative(it.updated_at)}
              </time>
              <span className="text-muted-foreground/40 transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          </motion.li>
        ))}
      </AnimatePresence>
    </motion.ul>
  );
}

export function MemorySearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [q, setQ] = useState(initialQuery);
  const [, startTransition] = useTransition();

  useEffect(() => setQ(initialQuery), [initialQuery]);

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(search.toString());
      if (q) next.set("q", q);
      else next.delete("q");
      startTransition(() => router.replace(`/memory?${next.toString()}`, { scroll: false }));
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="relative max-w-md">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by title..."
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring placeholder:text-muted-foreground/60"
      />
    </div>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}
