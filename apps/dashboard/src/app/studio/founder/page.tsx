import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import "@/lib/studio/founder-templates";
import { listClientFounderTemplates } from "@/lib/studio/founder-templates/registry";
import { resolveStudioEntry } from "@/lib/studio/resolve-studio-entry";
import { StudioPageShell } from "@/components/studio/StudioPageShell";

import FounderStudioClient from "./FounderStudioClient";

export const metadata = {
  title: "Founder Studio · BBC",
};

export const dynamic = "force-dynamic";

export default async function FounderStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; task?: string }>;
}) {
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/studio/founder")}`);
  }

  const templates = listClientFounderTemplates();
  const initialSeed = resolveStudioEntry("founder", await searchParams);

  return (
    <StudioPageShell role="founder">
      <FounderStudioClient templates={templates} initialSeed={initialSeed} />
    </StudioPageShell>
  );
}
