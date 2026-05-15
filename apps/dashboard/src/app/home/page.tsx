import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

export const metadata = { title: "Home · BBC" };

/**
 * Chat-home for member/operator/admin. The ChatHome component (Phase 6
 * Task 13) replaces the placeholder below — for now /home is a stub so
 * the routing changes can land before the new UI.
 *
 * Viewer is bounced to /brain as defense in depth; root '/' already
 * routes them there first.
 */
export default async function HomePage() {
  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/home");
  if (a.actor.role === "viewer") redirect("/brain");

  return (
    <div className="container page">
      <h1 className="page-title">Home (placeholder — chat-home lands in Phase 6)</h1>
    </div>
  );
}
