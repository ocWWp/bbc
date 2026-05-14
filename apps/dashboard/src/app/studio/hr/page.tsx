import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import "@/lib/studio/hr-templates";
import { listClientHrTemplates } from "@/lib/studio/hr-templates/registry";
import { StudioPageShell } from "@/components/studio/StudioPageShell";

import HrStudioClient from "./HrStudioClient";

export const metadata = {
  title: "People Studio · BBC",
};

export const dynamic = "force-dynamic";

export default async function HrStudioPage() {
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/studio/hr")}`);
  }

  const templates = listClientHrTemplates();

  return (
    <StudioPageShell role="hr">
      <HrStudioClient templates={templates} />
    </StudioPageShell>
  );
}
