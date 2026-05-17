/**
 * /library/install/[connector_id] — installer landing page.
 *
 * Server component. Routes the connector_id to the matching install UI:
 *   - github → render <GithubPatForm/> (Task 10)
 *   - google → no-op stub for now; Task 14 will render the OAuth start button
 *   - anything else → 404
 *
 * Mode guard: install is a DB-mode-only flow (secret encryption + RLS),
 * so we short-circuit with NotAvailableInFileMode when BBC_MODE != "db".
 * We don't call getStore() because the @bbc/store Store interface doesn't
 * expose a `.mode` field — BBC_MODE is the authoritative signal at the
 * dashboard layer (see src/lib/store.ts).
 */

import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { NotAvailableInFileMode } from "@/components/NotAvailableInFileMode";
import { GithubPatForm } from "./_components/GithubPatForm";

export const dynamic = "force-dynamic";

// "supported" means the route resolves rather than 404'ing. Google is a
// supported stub today; Task 14 fills the body.
const SUPPORTED: Record<string, true> = { github: true, google: true };

function isDbMode(): boolean {
  return (process.env.BBC_MODE ?? "file").toLowerCase() === "db";
}

export default async function InstallPage({
  params,
}: {
  params: Promise<{ connector_id: string }>;
}) {
  const { connector_id } = await params;
  if (!SUPPORTED[connector_id]) notFound();

  if (!isDbMode()) {
    return <NotAvailableInFileMode feature="Install" />;
  }

  // Same auth posture as /library: operator+ can install. We do the check
  // here too (not just in the server action) so unauthorized visitors get
  // bounced before seeing the form rather than failing on submit.
  const a = await requireActor();
  if (!a.ok) {
    redirect(
      `/auth/signin?callbackUrl=${encodeURIComponent(`/library/install/${connector_id}`)}`,
    );
  }
  const r = requireRole(a.actor, "operator");
  if (!r.ok) redirect("/brain");

  if (connector_id === "github") {
    return <GithubPatForm />;
  }
  if (connector_id === "google") {
    // Filled in by Task 14 (OAuth start). Intentionally not 404 — the route
    // is a known stub, not an unknown connector.
    return null;
  }
  return null;
}
