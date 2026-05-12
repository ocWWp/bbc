"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createRelation } from "@/app/memory/actions";
import { TypeChip } from "./type-chip";
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
    <div className="rel-picker">
      <button
        type="button"
        className="btn rel-picker-trigger"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "× close" : "+ link to another item"}
      </button>

      {open && (
        <div className="rel-picker-pop">
          <div className="rel-picker-kinds">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rel-picker-kind ${kind === k ? "is-on" : ""}`}
              >
                {k}
              </button>
            ))}
          </div>
          <p className="rel-picker-hint">{kindHint[kind]}</p>

          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="search items…"
            className="rel-picker-search"
          />

          <ul className="rel-picker-list">
            {items.length === 0 && <li className="rel-picker-empty">no matches</li>}
            {items.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => link(it.id)}
                  className="rel-picker-item"
                >
                  <TypeChip type={it.type} size="xs" />
                  <span className="rel-picker-item-title">{it.title}</span>
                </button>
              </li>
            ))}
          </ul>

          {error && <p className="rel-picker-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
