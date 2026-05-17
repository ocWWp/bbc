/**
 * Honest "not available" surface for DB-mode-only features when the dashboard
 * is running against a file-mode store (BBC_MODE != "db"). Per BBC mode
 * duality (CLAUDE.md non-negotiable #1 + ADR-0004 + feedback memory
 * `feedback_bbc_mode_duality`): we don't pretend a DB feature works against
 * the filesystem — we render this card instead.
 *
 * Used by routes that are intrinsically multi-tenant SaaS (OAuth installs,
 * connector secrets, etc.) and have no file-mode equivalent.
 */
export function NotAvailableInFileMode({ feature }: { feature: string }) {
  return (
    <div className="container page">
      <div
        className="card card-pad"
        role="status"
        style={{ maxWidth: 640, margin: "4rem auto" }}
      >
        <div className="e-eyebrow">file mode</div>
        <h1 className="page-title" style={{ marginTop: 8 }}>
          {feature} is not available in file mode.
        </h1>
        <p className="page-blurb" style={{ marginTop: 12 }}>
          This surface stores per-tenant secrets and only runs in DB mode
          (multi-tenant SaaS). Self-hosted file-mode deployments don&apos;t
          have the encryption + RLS guarantees this flow requires.
        </p>
        <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          Set <code className="mono">BBC_MODE=db</code> and configure Supabase
          to enable it. See <code className="mono">memory/tech/deployment-modes.md</code>.
        </p>
      </div>
    </div>
  );
}
