import { notFound, redirect } from "next/navigation";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getMemoryItem, getRelations } from "../queries";
import { EditorShell } from "./editor-shell";

export const dynamic = "force-dynamic";

export default async function MemoryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await requireActor();
  if (!a.ok) redirect(`/auth/signin?callbackUrl=${encodeURIComponent(`/memory/${id}`)}`);
  // Per ADR-0012: editable detail view is operator+. Members read via /brain/<id>.
  const r = requireRole(a.actor, "operator");
  if (!r.ok) redirect(`/brain/${id}`);

  const [item, relations] = await Promise.all([getMemoryItem(id), getRelations(id)]);
  if (!item || !item.type) notFound();
  return <EditorShell item={item} relations={relations} />;
}
