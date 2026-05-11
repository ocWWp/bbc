import { notFound } from "next/navigation";
import { getMemoryItem, getRelations } from "../queries";
import { EditorShell } from "./editor-shell";

export const dynamic = "force-dynamic";

export default async function MemoryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [item, relations] = await Promise.all([getMemoryItem(id), getRelations(id)]);
  if (!item || !item.type) notFound();
  return <EditorShell item={item} relations={relations} />;
}
