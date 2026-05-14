import { redirect } from "next/navigation";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { listMemoryItems } from "../memory/queries";
import { SUPERTAGS, type Supertag } from "@/lib/memory/types";
import { BrainGrid, type BrainItem } from "./_components/BrainGrid";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ type?: string; q?: string }>;

/**
 * Read-only counterpart to /memory. Members land here; operator+ stay on
 * /memory (which is the editable view). RLS already blocks members from
 * mutating; this page just hides the edit affordances so members aren't
 * confused by 403s on click.
 */
export default async function BrainPage({ searchParams }: { searchParams: SearchParams }) {
  const a = await requireActor();
  if (!a.ok) redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/brain")}`);
  // Operators and admins use /memory directly — give them the editable view.
  const elevated = requireRole(a.actor, "operator");
  if (elevated.ok) redirect("/memory");

  const sp = await searchParams;
  const activeType = (SUPERTAGS as readonly string[]).includes(sp.type ?? "")
    ? (sp.type as Supertag)
    : undefined;

  const [items, allItems] = await Promise.all([
    listMemoryItems({ type: activeType, q: sp.q }),
    listMemoryItems({ q: sp.q }),
  ]);

  const counts: Record<string, number> = {};
  for (const t of SUPERTAGS) counts[t] = 0;
  for (const it of allItems) {
    const t = (it as { type?: string }).type;
    if (t && t in counts) counts[t] += 1;
  }

  return (
    <BrainGrid
      items={items as ReadonlyArray<BrainItem>}
      totalCount={allItems.length}
      counts={counts}
      activeType={activeType}
      query={sp.q}
    />
  );
}
