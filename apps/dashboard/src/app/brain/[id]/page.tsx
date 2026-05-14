import { notFound, redirect } from "next/navigation";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getMemoryItem, getRelations } from "../../memory/queries";
import { ReadOnlyMemory } from "./ReadOnlyMemory";

export const dynamic = "force-dynamic";

/**
 * Read-only counterpart to /memory/[id]. Members land here; operator+ are
 * redirected to /memory/[id] (the editable view).
 */
export default async function BrainDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await requireActor();
  if (!a.ok) redirect(`/auth/signin?callbackUrl=${encodeURIComponent(`/brain/${id}`)}`);
  const elevated = requireRole(a.actor, "operator");
  if (elevated.ok) redirect(`/memory/${id}`);

  const [item, relations] = await Promise.all([getMemoryItem(id), getRelations(id)]);
  if (!item || !item.type) notFound();
  return <ReadOnlyMemory item={item} relations={relations} />;
}
