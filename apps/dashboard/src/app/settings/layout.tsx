import Link from "next/link";
import { SettingsRail } from "@/components/SettingsRail";

/**
 * Shared layout for everything under /settings. Renders the page-head and
 * left rail; child pages provide the content area on the right.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container page">
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <Link href="/queue">acme</Link>
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
