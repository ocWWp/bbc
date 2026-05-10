import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { WelcomeTour } from "./WelcomeTour";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ step?: string }>;

export default async function WelcomePage({ searchParams }: { searchParams: SearchParams }) {
  const { step: stepStr } = await searchParams;
  const step = Math.max(1, Math.min(3, parseInt(stepStr ?? "1", 10) || 1));

  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/welcome");

  return (
    <main style={{ maxWidth: 720, margin: "32px auto", padding: 24 }}>
      <WelcomeTour
        step={step as 1 | 2 | 3}
        tenantSlug={a.actor.tenant_slug}
        role={a.actor.role}
      />
    </main>
  );
}
