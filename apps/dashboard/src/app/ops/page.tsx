// /ops — operator cockpit. Single page consolidating "what needs my
// attention" (top) and "how are the three loops doing" (bottom). Read-only
// in Phase B; inline accept/reject lands in Phase C.
//
// Server component, gated to operator+ per ADR-0012. Members continue to
// use /brain. Admin sees an additional dead-letter-queue row in Needs
// Attention; everything else is shared with operators.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { readOpsState } from "@/lib/ops/read-ops-state";
import { getExpectedProviders } from "@/lib/ops/expected-providers";
import { WorkspaceCrumb } from "@/components/WorkspaceCrumb";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ops · BBC" };

function relTime(iso: string | null): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Math.max(0, Date.now() - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}

/** Tabular-number count component used inside pills + snapshot rows. Keeps
 *  digit columns aligned across all rows so the eye scans the page as a
 *  table without table chrome. `aria-label` is the spoken-out reading. */
function Count({ n, label }: { n: number; label: string }) {
  return (
    <span className="ops-count" aria-label={label}>
      {n.toLocaleString("en-US")}
    </span>
  );
}

export default async function OpsPage() {
  const a = await requireActor();
  if (!a.ok) redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/ops")}`);
  // Mirrors /queue: operator+ only. Members get bounced to /brain.
  const r = requireRole(a.actor, "operator");
  if (!r.ok) redirect("/brain");

  const supabase = await getSupabaseServerClient();
  const expectedProviders = await getExpectedProviders();
  const state = await readOpsState(supabase, {
    tenantId: a.actor.tenant_id,
    isAdmin: a.actor.role === "admin",
    expectedProviders,
  });

  const { attention, snapshot, degraded } = state;
  const nothingNeeded =
    attention.pendingProposals.length === 0 &&
    attention.missingProviderKeys.length === 0 &&
    attention.failedConnectors.length === 0 &&
    attention.dlqCount === 0;

  // Any section degraded means we should warn the operator at the top of
  // Needs Attention rather than silently render zeros below.
  const anyDegraded =
    degraded.pendingProposals ||
    degraded.lastAcceptedAt ||
    degraded.memory ||
    degraded.providers ||
    degraded.ingest ||
    degraded.failedConnectors ||
    degraded.dlq;

  return (
    <div className="container page ops-page">
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <WorkspaceCrumb tenantSlug={a.actor.tenant_slug} />
            <span className="sep">/</span>
            <span className="current">ops</span>
          </div>
          <h1 className="page-title">
            ops <span className="serif">cockpit</span>
          </h1>
          <p className="page-blurb">
            What needs your attention, and how the three loops are doing.
            Re-reads every visit — no polling, no stale state.
          </p>
        </div>
        {!nothingNeeded && (
          <div className="page-actions">
            <span
              className="pill warn"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {attention.pendingProposals.length +
                attention.missingProviderKeys.length +
                attention.failedConnectors.length +
                attention.dlqCount}{" "}
              open
            </span>
          </div>
        )}
      </header>

      {anyDegraded && (
        <div className="ops-degraded-banner" role="status">
          <span className="dot" />
          <span>
            <strong>partial read:</strong> some data sources didn&apos;t respond
            — refresh to retry. Sections marked &ldquo;unavailable&rdquo; below
            show stale or missing data.
          </span>
        </div>
      )}

      {/* ---------- Needs Attention ---------- */}
      <section className="ops-section" aria-labelledby="ops-attention-h">
        <div className="ops-section-head">
          <h2 id="ops-attention-h" className="section-eyebrow">
            needs attention
          </h2>
          <span className="ops-section-sub muted">
            actions only you can take
          </span>
        </div>

        {nothingNeeded ? (
          <div className="empty lg">
            <div className="e-eyebrow">all clear</div>
            <h3 className="e-title">
              Nothing waiting on <span className="serif">you</span>.
            </h3>
            <p className="e-body">
              No pending proposals, missing provider keys, failed connectors,
              or dead-lettered payloads. When studios file proposals or a
              connector breaks, the row appears here with the action button
              attached.
            </p>
            <div className="e-actions">
              <Link href="/studio" className="btn primary">
                open /studio
              </Link>
              <Link href="/brain" className="btn">
                browse memory
              </Link>
            </div>
          </div>
        ) : (
          <div className="card card-pad ops-attention">
            {degraded.pendingProposals ? (
              <DegradedRow label="proposals queue" />
            ) : (
              attention.pendingProposals.length > 0 && (
                <div className="ops-attention-row">
                  <span className="pill warn ops-pill-count">
                    <Count
                      n={attention.pendingProposals.length}
                      label={`${attention.pendingProposals.length} pending proposal${
                        attention.pendingProposals.length === 1 ? "" : "s"
                      }`}
                    />
                  </span>
                  <span className="ops-row-text">
                    proposal{attention.pendingProposals.length === 1 ? "" : "s"}{" "}
                    awaiting review
                    {attention.pendingProposals[0]?.summary && (
                      <span className="ops-row-hint">
                        {" · most recent: "}
                        <span className="mono">
                          {attention.pendingProposals[0].summary.slice(0, 64)}
                          {attention.pendingProposals[0].summary.length > 64
                            ? "…"
                            : ""}
                        </span>
                      </span>
                    )}
                  </span>
                  <Link href="/queue" className="ops-row-cta mono">
                    review →
                  </Link>
                </div>
              )
            )}

            {degraded.providers ? (
              <DegradedRow label="provider keys" />
            ) : (
              attention.missingProviderKeys.length > 0 && (
                <div className="ops-attention-row">
                  <span className="pill warn ops-pill-count">
                    <Count
                      n={attention.missingProviderKeys.length}
                      label={`${attention.missingProviderKeys.length} missing provider key${
                        attention.missingProviderKeys.length === 1 ? "" : "s"
                      }`}
                    />
                  </span>
                  <span className="ops-row-text">
                    missing provider key
                    {attention.missingProviderKeys.length === 1 ? "" : "s"}:{" "}
                    <span className="mono">
                      {attention.missingProviderKeys.join(", ")}
                    </span>
                  </span>
                  <Link href="/settings/keys" className="ops-row-cta mono">
                    configure →
                  </Link>
                </div>
              )
            )}

            {degraded.failedConnectors ? (
              <DegradedRow label="connector status" />
            ) : (
              attention.failedConnectors.length > 0 && (
                <div className="ops-attention-row">
                  <span className="pill err ops-pill-count">
                    <Count
                      n={attention.failedConnectors.length}
                      label={`${attention.failedConnectors.length} connector${
                        attention.failedConnectors.length === 1 ? "" : "s"
                      } not syncing`}
                    />
                  </span>
                  <span className="ops-row-text">
                    connector
                    {attention.failedConnectors.length === 1 ? "" : "s"} not
                    syncing
                    <span className="ops-row-hint">
                      {" · "}
                      <span className="mono">
                        {attention.failedConnectors
                          .slice(0, 3)
                          .map((c) => `${c.connector_id} (${c.status})`)
                          .join(", ")}
                        {attention.failedConnectors.length > 3
                          ? `, +${attention.failedConnectors.length - 3} more`
                          : ""}
                      </span>
                    </span>
                  </span>
                  <Link
                    href="/library?tab=connectors"
                    className="ops-row-cta mono"
                  >
                    view →
                  </Link>
                </div>
              )
            )}

            {a.actor.role === "admin" && degraded.dlq ? (
              <DegradedRow label="dead-letter queue" admin />
            ) : (
              attention.dlqCount > 0 && (
                <div className="ops-attention-row" data-admin="true">
                  <span className="pill err ops-pill-count">
                    <Count
                      n={attention.dlqCount}
                      label={`${attention.dlqCount} dead-lettered webhook payload${
                        attention.dlqCount === 1 ? "" : "s"
                      }`}
                    />
                  </span>
                  <span className="ops-row-text">
                    dead-lettered webhook payload
                    {attention.dlqCount === 1 ? "" : "s"}
                    <span className="ops-admin-tag mono"> · admin</span>
                  </span>
                  <Link
                    href="/library/diagnostics"
                    className="ops-row-cta mono"
                  >
                    inspect →
                  </Link>
                </div>
              )
            )}
          </div>
        )}
      </section>

      {/* ---------- System Snapshot ---------- */}
      <section className="ops-section" aria-labelledby="ops-snapshot-h">
        <div className="ops-section-head">
          <h2 id="ops-snapshot-h" className="section-eyebrow">
            system snapshot
          </h2>
          <span className="ops-section-sub muted">
            glanceable state across the three loops
          </span>
        </div>

        <div className="card card-pad ops-snapshot" role="list">
          {/* Queue */}
          <SnapshotRow
            label="Queue"
            href="/queue"
            degraded={degraded.pendingProposals || degraded.lastAcceptedAt}
            empty={snapshot.queue.pending === 0 && !snapshot.queue.lastAcceptedAt}
            emptyCopy="no proposals yet — studios file here as they accept drafts"
          >
            <span className="ops-snap-fact">
              <Count
                n={snapshot.queue.pending}
                label={`${snapshot.queue.pending} pending`}
              />{" "}
              pending
            </span>
            <span className="ops-snap-sep">·</span>
            <span className="ops-snap-fact muted">
              last accepted{" "}
              <span className="mono">{relTime(snapshot.queue.lastAcceptedAt)}</span>
            </span>
          </SnapshotRow>

          {/* Memory */}
          <SnapshotRow
            label="Memory"
            href="/brain"
            degraded={degraded.memory}
            empty={snapshot.memory.files === 0}
            emptyCopy="no memory yet — try /welcome or chat with /brain"
          >
            <span className="ops-snap-fact">
              <Count
                n={snapshot.memory.files}
                label={`${snapshot.memory.files} memory file${
                  snapshot.memory.files === 1 ? "" : "s"
                }`}
              />{" "}
              file{snapshot.memory.files === 1 ? "" : "s"}
            </span>
            <span className="ops-snap-sep">·</span>
            <span className="ops-snap-fact muted">
              last updated{" "}
              <span className="mono">
                {relTime(snapshot.memory.lastUpdatedAt)}
              </span>
            </span>
          </SnapshotRow>

          {/* Providers */}
          <SnapshotRow
            label="Providers"
            href="/settings/keys"
            degraded={degraded.providers}
            empty={snapshot.providers.configured === 0}
            emptyCopy="no provider keys configured — bring your own from /settings/keys"
          >
            <span className="ops-snap-fact">
              <Count
                n={snapshot.providers.configured}
                label={`${snapshot.providers.configured} configured`}
              />{" "}
              configured
            </span>
            <span className="ops-snap-sep">·</span>
            <span className="ops-snap-fact muted">
              last tested{" "}
              <span className="mono">
                {relTime(snapshot.providers.lastTestedAt)}
              </span>
            </span>
          </SnapshotRow>

          {/* Ingest */}
          <SnapshotRow
            label="Ingest"
            href="/library?tab=connectors"
            degraded={degraded.ingest}
            empty={snapshot.ingest.connectors === 0}
            emptyCopy="no connectors connected yet — install lands in Phase K"
          >
            <span className="ops-snap-fact">
              <Count
                n={snapshot.ingest.connectors}
                label={`${snapshot.ingest.connectors} connector${
                  snapshot.ingest.connectors === 1 ? "" : "s"
                }`}
              />{" "}
              connector{snapshot.ingest.connectors === 1 ? "" : "s"}
            </span>
            <span className="ops-snap-sep">·</span>
            <span className="ops-snap-fact muted">
              last sync{" "}
              <span className="mono">{relTime(snapshot.ingest.lastSyncAt)}</span>
            </span>
          </SnapshotRow>
        </div>
      </section>
    </div>
  );
}

/** Single snapshot row with consistent label/content/link grid. Shows a
 *  degraded note OR an empty-state copy OR the actual children, in that
 *  priority — zeros would lie when the underlying read failed, and an
 *  empty-state line is more useful than "0 · last sync never". */
function SnapshotRow({
  label,
  href,
  degraded,
  empty,
  emptyCopy,
  children,
}: {
  label: string;
  href: string;
  degraded: boolean;
  empty: boolean;
  emptyCopy: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ops-snap-row" role="listitem">
      <span className="ops-snap-k">{label}</span>
      <span className="ops-snap-v">
        {degraded ? (
          <span className="ops-snap-degraded muted">
            unavailable — couldn&apos;t load
          </span>
        ) : empty ? (
          <span className="muted">{emptyCopy}</span>
        ) : (
          children
        )}
      </span>
      {!degraded && !empty && (
        <Link href={href} className="ops-snap-link mono">
          view →
        </Link>
      )}
    </div>
  );
}

/** Inline muted row for a Needs-Attention section whose underlying query
 *  errored. Subtle, not alarming — the page-level banner already warns. */
function DegradedRow({ label, admin }: { label: string; admin?: boolean }) {
  return (
    <div className="ops-attention-row ops-attention-degraded">
      <span className="pill muted">—</span>
      <span className="ops-row-text muted">
        {label} unavailable — couldn&apos;t load
        {admin && <span className="ops-admin-tag mono"> · admin</span>}
      </span>
    </div>
  );
}
