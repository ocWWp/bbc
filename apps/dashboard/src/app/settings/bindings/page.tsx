import { readBindings } from "@/lib/read-bindings";

export const dynamic = "force-dynamic";

export default async function BindingsSettingsPage() {
  const bindings = await readBindings();
  const active = bindings.filter((b) => b.kind === "active").length;
  const provisional = bindings.filter((b) => b.kind === "provisional").length;
  const unbound = bindings.filter((b) => b.kind === "unbound").length;

  return (
    <>
      <div className="set-block">
        <div className="set-block-head">
          <div>
            <div className="h">Role → provider bindings</div>
            <div className="sub">
              Which provider adapter each role uses. Source of truth:{" "}
              <code>memory/ops/bindings.yaml</code> (Main layer).
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <span className="pill ok">active {active}</span>
            <span className="pill warn">provisional {provisional}</span>
            <span className="pill muted">unbound {unbound}</span>
          </div>
        </div>
        {bindings.length === 0 ? (
          <div style={{ padding: "24px 20px" }}>
            <p style={{ color: "var(--paper-muted)", fontSize: 13.5, margin: 0 }}>
              <code>bindings.yaml</code> could not be parsed.
            </p>
          </div>
        ) : (
          <div>
            {bindings.map((b) => (
              <div
                key={b.role}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr 110px 140px",
                  gap: 16,
                  alignItems: "center",
                  padding: "14px 20px",
                  borderBottom: "1px solid var(--paper-rule)",
                }}
              >
                <code
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 13,
                    color: "var(--paper-ink)",
                    background: "var(--paper-bg-2)",
                    border: "1px solid var(--paper-rule)",
                    padding: "3px 7px",
                    borderRadius: 5,
                    justifySelf: "start",
                  }}
                >
                  {b.role}
                </code>
                <span style={{ fontSize: 13.5 }}>
                  {b.kind === "unbound" ? (
                    <span style={{ color: "var(--paper-muted)" }}>—</span>
                  ) : (
                    <>
                      <code
                        style={{
                          fontFamily: "var(--font-geist-mono), monospace",
                          fontSize: 12.5,
                          color: "var(--paper-ink-2)",
                        }}
                      >
                        {b.provider}
                      </code>
                      {b.notes && (
                        <span
                          className="mono"
                          style={{
                            fontSize: 11,
                            color: "var(--paper-muted)",
                            marginLeft: 8,
                          }}
                        >
                          {b.notes}
                        </span>
                      )}
                    </>
                  )}
                </span>
                <span
                  className={`pill ${
                    b.kind === "active"
                      ? "ok"
                      : b.kind === "provisional"
                      ? "warn"
                      : "muted"
                  }`}
                >
                  {b.kind}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: "var(--paper-muted)",
                    justifySelf: "end",
                  }}
                >
                  {b.kind === "unbound" ? "—" : b.bound_at.slice(5, 16).replace("T", " ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
