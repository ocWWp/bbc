import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import "@/lib/studio/founder-templates";
import { listClientFounderTemplates } from "@/lib/studio/founder-templates/registry";
import { StudioPageShell } from "@/components/studio/StudioPageShell";

import FounderStudioClient from "./FounderStudioClient";

export const metadata = {
  title: "Founder Studio · BBC",
};

export const dynamic = "force-dynamic";

export default async function FounderStudioPage() {
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/studio/founder")}`);
  }

  const templates = listClientFounderTemplates();

  return (
    <StudioPageShell role="founder">
      <FounderStudioClient templates={templates} />
    </StudioPageShell>
  );
}
