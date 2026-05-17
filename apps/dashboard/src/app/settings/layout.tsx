import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { SettingsRail } from "@/components/SettingsRail";
import { WorkspaceCrumb } from "@/components/WorkspaceCrumb";

/**
 * Shared layout for everything under /settings. Renders the page-head and
 * left rail; child pages provide the content area on the right.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=%2Fsettings");
  return (
    <div className="container page">
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <WorkspaceCrumb tenantSlug={a.actor.tenant_slug} />
            <span className="sep">/</span>
            <span className="current">settings</span>
          </div>
          <h1 className="page-title">settings</h1>
          <p className="page-blurb">
            Everything that isn&apos;t memory, queue, or studio. Grouped by
            responsibility, not by table.
          </p>
        </div>
      </header>

      <div className="split-rail">
        <aside>
          <SettingsRail />
        </aside>
        <main className="set-section">{children}</main>
      </div>
    </div>
  );
}
