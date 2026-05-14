import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import "@/lib/studio/legal-templates";
import { listClientLegalTemplates } from "@/lib/studio/legal-templates/registry";
import { resolveStudioEntry } from "@/lib/studio/resolve-studio-entry";
import { StudioPageShell } from "@/components/studio/StudioPageShell";
import { LegalDisclaimerBanner } from "@/components/studio/LegalDisclaimerBanner";

import LegalStudioClient from "./LegalStudioClient";

export const metadata = {
  title: "Legal Studio · BBC",
};

export const dynamic = "force-dynamic";

export default async function LegalStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; task?: string }>;
}) {
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/studio/legal")}`);
  }

  const templates = listClientLegalTemplates();
  const initialSeed = resolveStudioEntry("legal", await searchParams);

  return (
    <StudioPageShell role="legal">
      {/* First-class, persistent — renders above the client in every state. */}
      <div className="space-y-6">
        <LegalDisclaimerBanner />
        <LegalStudioClient templates={templates} initialSeed={initialSeed} />
      </div>
    </StudioPageShell>
  );
}
