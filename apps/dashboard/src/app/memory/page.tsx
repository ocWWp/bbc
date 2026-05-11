import Link from "next/link";
import { Suspense } from "react";
import { listMemoryItems } from "./queries";
import { Button } from "@/components/ui/button";
import { TypeChip } from "@/components/memory/type-chip";
import { SUPERTAGS, supertagMeta, type Supertag } from "@/lib/memory/types";
import { MemoryListAnimated, MemorySearch } from "./_client";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ type?: string; q?: string }>;

export default async function MemoryIndex({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const activeType = (SUPERTAGS as readonly string[]).includes(sp.type ?? "")
    ? (sp.type as Supertag)
    : undefined;
  const items = await listMemoryItems({ type: activeType, q: sp.q });

  return (
    <div className="space-y-8 pb-16">
      <header className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Memory</h1>
            <p className="text-sm text-muted-foreground">
              The shared brain — typed, linked, and read by every agent that touches your product.
            </p>
          </div>
          <Button asChild>
            <Link href="/memory/new">+ New item</Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Link
            href="/memory"
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${!activeType ? "bg-foreground text-background" : "bg-muted hover:bg-muted/80 text-muted-foreground"}`}
          >
            All
          </Link>
          {SUPERTAGS.map((t) => (
            <Link
              key={t}
              href={`/memory?type=${t}`}
              className={`text-xs uppercase tracking-wide font-medium px-3 py-1.5 rounded-full transition-all ${activeType === t ? "scale-105 shadow-sm" : "opacity-70 hover:opacity-100"}`}
            >
              <TypeChip type={t} size="xs" className="-mx-1.5 -my-0.5" />
              <span className="ml-1.5 text-muted-foreground normal-case tracking-normal">
                {supertagMeta[t].label}
              </span>
            </Link>
          ))}
        </div>

        <MemorySearch initialQuery={sp.q ?? ""} />
      </header>

      <Suspense fallback={<ListSkeleton />}>
        <MemoryListAnimated items={items} />
      </Suspense>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />
      ))}
    </div>
  );
}
