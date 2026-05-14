import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import "@/lib/studio/designer-templates";
import { listClientDesignerTemplates } from "@/lib/studio/designer-templates/registry";
import { resolveStudioEntry } from "@/lib/studio/resolve-studio-entry";
import { StudioPageShell } from "@/components/studio/StudioPageShell";

import DesignerStudioClient from "./DesignerStudioClient";

export const metadata = {
  title: "Designer Studio · BBC",
};

export const dynamic = "force-dynamic";

export default async function DesignerStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; task?: string }>;
}) {
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/studio/designer")}`);
  }

  const templates = listClientDesignerTemplates();
  const initialSeed = resolveStudioEntry("designer", await searchParams);

  return (
    <StudioPageShell role="designer">
      <DesignerStudioClient templates={templates} initialSeed={initialSeed} />
    </StudioPageShell>
  );
}
