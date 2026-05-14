import Link from "next/link";
import { listTools } from "@/lib/read-tools";
import { readBindings } from "@/lib/read-bindings";

export const dynamic = "force-dynamic";

/**
 * Surface the 2-3 most useful metadata fields per provider. Falls back to the
 * first three fields when no preferred keys match.
 */
function pickHeadlineMetadata(meta: Record<string, string>): [string, string][] {
  const preferredKeys = [
    "model_id",
    "context_window_tokens",
    "access_method",
    "supports_design_tokens",
    "vendor_status_page",
  ];
  const picked: [string, string][] = [];
  for (const k of preferredKeys) {
    if (meta[k]) picked.push([k, meta[k]]);
    if (picked.length === 3) return picked;
  }
  if (picked.length > 0) return picked;
  return Object.entries(meta).slice(0, 3);
}

export default async function ToolsSettingsPage() {
  const [tools, bindings] = await Promise.all([listTools(), readBindings()]);

  const boundProviderIds = new Set(
    bindings.filter((b) => b.kind !== "unbound").map((b) => b.provider),
  );

  const active = tools.filter((t) => t.status === "active").length;
  const candidate = tools.filter((t) => t.status === "candidate").length;
  const archived = tools.filter((t) => t.status === "archived").length;

  const sorted = [...tools].sort((a, b) => a.provider_id.localeCompare(b.provider_id));

  return (
    <>
      <div className="set-block">
        <div className="set-block-head">
          <div>
            <div className="h">Provider catalog · {tools.length}</div>
            <div className="sub">
              Every adapter BBC knows about. Role agents resolve their tool kit
              through this catalog plus{" "}
              <Link href="/settings/bindings" style={{ color: "var(--paper-accent)" }}>
                bindings
              </Link>
              . Source: <code>memory/ops/providers/*.yaml</code>.
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <span className="pill ok">active {active}</span>
            <span className="pill warn">candidate {candidate}</span>
            <span className="pill muted">archived {archived}</span>
          </div>
        </div>
        {tools.length === 0 ? (
          <div style={{ padding: "24px 20px" }}>
            <p style={{ color: "var(--paper-muted)", fontSize: 13.5, margin: 0 }}>
              No provider adapters found under <code>memory/ops/providers/</code>.
            </p>
          </div>
        ) : (
          <div>
            {sorted.map((t) => {
              const isBound = boundProviderIds.has(t.provider_id);
              const headlineMeta = pickHeadlineMetadata(t.metadata);
              return (
                <div
                  key={t.provider_id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(180px, 1fr) auto auto",
                    gap: 16,
                    alignItems: "start",
                    padding: "14px 20px",
                    borderBottom: "1px solid var(--paper-rule)",
                  }}
                >
                  <div>
                    <code
                      style={{
                        fontFamily: "var(--font-geist-mono), monospace",
                        fontSize: 13,
                        color: "var(--paper-ink)",
                        background: "var(--paper-bg-2)",
                        border: "1px solid var(--paper-rule)",
                        padding: "3px 7px",
                        borderRadius: 5,
                      }}
                    >
                      {t.provider_id}
                    </code>
                    {t.implements.length > 0 && (
                      <div
                        className="mono"
                        style={{ fontSize: 11.5, color: "var(--paper-muted)", marginTop: 6 }}
                      >
                        implements: {t.implements.join(" · ")}
                      </div>
                    )}
                    {headlineMeta.length > 0 && (
                      <div
                        className="mono"
                        style={{
                          fontSize: 11.5,
                          color: "var(--paper-ink-2)",
                          marginTop: 4,
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 10,
                        }}
                      >
                        {headlineMeta.map(([k, v]) => (
                          <span key={k}>
                            <span style={{ color: "var(--paper-muted)" }}>{k}:</span> {v}
                          </span>
                        ))}
                      </div>
                    )}
                    {t.tags.length > 0 && (
                      <div
                        className="mono"
                        style={{ fontSize: 11, color: "var(--paper-muted-2)", marginTop: 4 }}
                      >
                        tags: {t.tags.join(", ")}
                      </div>
                    )}
                  </div>
                  <span
                    className={`pill ${
                      t.status === "active"
                        ? "ok"
                        : t.status === "candidate"
                        ? "warn"
                        : "muted"
                    }`}
                  >
                    {t.status}
                  </span>
                  <span className={`pill ${isBound ? "accent" : "muted"}`}>
                    {isBound ? "bound" : "unbound"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
