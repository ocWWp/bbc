import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import "@/lib/studio/hr-templates";
import { listClientHrTemplates } from "@/lib/studio/hr-templates/registry";
import { resolveStudioEntry } from "@/lib/studio/resolve-studio-entry";
import { StudioPageShell } from "@/components/studio/StudioPageShell";

import HrStudioClient from "./HrStudioClient";

export const metadata = {
  title: "People Studio · BBC",
};

export const dynamic = "force-dynamic";

export default async function HrStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; task?: string }>;
}) {
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/studio/hr")}`);
  }

  const templates = listClientHrTemplates();
  const initialSeed = resolveStudioEntry("hr", await searchParams);

  return (
    <StudioPageShell role="hr">
      <HrStudioClient templates={templates} initialSeed={initialSeed} />
    </StudioPageShell>
  );
}
