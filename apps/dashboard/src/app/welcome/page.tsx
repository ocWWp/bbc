import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { Onboarding } from "./Onboarding";

export const metadata = { title: "Welcome — BBC" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ preview?: string }>;

export default async function WelcomePage({ searchParams }: { searchParams: SearchParams }) {
  const { preview } = await searchParams;

  // Dev-only preview mode: renders the onboarding chrome with mock proposals
  // so the magic UI is visible without auth + DB setup. ?preview=1 in dev.
  if (preview === "1" && process.env.NODE_ENV !== "production") {
    return <Onboarding tenantSlug="preview-tenant" previewMode />;
  }

  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/welcome");
  return <Onboarding tenantSlug={a.actor.tenant_slug} />;
}
