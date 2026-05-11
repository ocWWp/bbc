import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { Onboarding } from "./Onboarding";

export const metadata = { title: "Welcome — BBC" };
export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/welcome");
  return <Onboarding tenantSlug={a.actor.tenant_slug} />;
}
