"use client";

import { useEffect, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createRelation } from "@/app/memory/actions";
import { TypeChip } from "./type-chip";
import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/supabase/database.types";
import type { Supertag } from "@/lib/memory/types";

type RelationKind = Database["public"]["Enums"]["memory_relation_kind"];

const KINDS: RelationKind[] = ["cites", "supersedes", "implements", "exemplifies", "owned_by"];

const kindHint: Record<RelationKind, string> = {
  cites: "References this item",
  supersedes: "Replaces an older item",
  implements: "Is a concrete instance of",
  exemplifies: "Is an example of",
  owned_by: "Is owned by someone",
};

export function RelationPicker({ srcId }: { srcId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RelationKind>("cites");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Array<{ id: string; type: Supertag; title: string }>>([]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      let qb = supabase
        .from("memory_files")
        .select("id, type, title")
        .neq("id", srcId)
        .not("type", "is", null)
        .in("status", ["draft", "active"])
        .order("updated_at", { ascending: false })
        .limit(20);
      if (q) qb = qb.ilike("title", `%${q}%`);
      const { data } = await qb;
      if (!cancelled && data) {
        setItems(data.map((d) => ({ id: d.id, type: d.type as Supertag, title: d.title ?? "Untitled" })));
      }
    })();
    return () => { cancelled = true; };
  }, [open, q, srcId]);

  const link = (dstId: string) => {
    start(async () => {
      const res = await createRelation(srcId, dstId, kind);
      if (res.ok) {
        setOpen(false);
        setQ("");
        router.refresh();
      } else {
        setError(res.error ?? "Failed");
      }
    });
  };

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen((o) => !o)}
        className="w-full justify-start text-xs"
      >
        + Link to another item
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-2 rounded-md border bg-background p-2">
              <div className="flex flex-wrap gap-1">
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full transition-colors ${
                      kind === k
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/70">{kindHint[kind]}</p>

              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search items..."
                className="w-full rounded-md border bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />

              <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                {items.length === 0 && (
                  <li className="px-2 py-2 text-center text-xs text-muted-foreground/60">
                    No matches
                  </li>
                )}
                {items.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => link(it.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <TypeChip type={it.type} size="xs" />
                      <span className="truncate">{it.title}</span>
                    </button>
                  </li>
                ))}
              </ul>

              {error && <p className="text-xs text-rose-500">{error}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
