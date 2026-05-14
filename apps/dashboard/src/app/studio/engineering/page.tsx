import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import "@/lib/studio/eng-templates";
import { listClientEngTemplates } from "@/lib/studio/eng-templates/registry";
import { resolveStudioEntry } from "@/lib/studio/resolve-studio-entry";
import { StudioPageShell } from "@/components/studio/StudioPageShell";

import EngStudioClient from "./EngStudioClient";

export const metadata = {
  title: "Engineering Studio · BBC",
};

export const dynamic = "force-dynamic";

export default async function EngineeringStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; task?: string }>;
}) {
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/studio/engineering")}`);
  }

  const templates = listClientEngTemplates();
  const initialSeed = resolveStudioEntry("engineering", await searchParams);

  return (
    <StudioPageShell role="engineering">
      <EngStudioClient templates={templates} initialSeed={initialSeed} />
    </StudioPageShell>
  );
}
