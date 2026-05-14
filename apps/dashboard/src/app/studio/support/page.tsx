import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import "@/lib/studio/support-templates";
import { listClientSupportTemplates } from "@/lib/studio/support-templates/registry";
import { resolveStudioEntry } from "@/lib/studio/resolve-studio-entry";
import { StudioPageShell } from "@/components/studio/StudioPageShell";

import SupportStudioClient from "./SupportStudioClient";

export const metadata = {
  title: "Support Studio · BBC",
};

export const dynamic = "force-dynamic";

export default async function SupportStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; task?: string }>;
}) {
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/studio/support")}`);
  }

  const templates = listClientSupportTemplates();
  const initialSeed = resolveStudioEntry("support", await searchParams);

  return (
    <StudioPageShell role="support">
      <SupportStudioClient templates={templates} initialSeed={initialSeed} />
    </StudioPageShell>
  );
}
