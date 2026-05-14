import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import "@/lib/studio/finance-templates";
import { listClientFinanceTemplates } from "@/lib/studio/finance-templates/registry";
import { StudioPageShell } from "@/components/studio/StudioPageShell";

import FinanceStudioClient from "./FinanceStudioClient";

export const metadata = {
  title: "Finance Studio · BBC",
};

export const dynamic = "force-dynamic";

export default async function FinanceStudioPage() {
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/studio/finance")}`);
  }

  const templates = listClientFinanceTemplates();

  return (
    <StudioPageShell role="finance">
      <FinanceStudioClient templates={templates} />
    </StudioPageShell>
  );
}
