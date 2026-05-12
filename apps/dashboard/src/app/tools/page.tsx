import { listTools } from "@/lib/read-tools";
import { readBindings } from "@/lib/read-bindings";
import DataSource from "@/components/DataSource";

export const dynamic = "force-dynamic";

export default async function ToolsPage() {
  const [tools, bindings] = await Promise.all([listTools(), readBindings()]);

  const boundProviderIds = new Set(
    bindings.filter((b) => b.kind !== "unbound").map((b) => b.provider),
  );

  const active = tools.filter((t) => t.status === "active").length;
  const candidate = tools.filter((t) => t.status === "candidate").length;
  const archived = tools.filter((t) => t.status === "archived").length;
  const bound = tools.filter((t) => boundProviderIds.has(t.provider_id)).length;

  const sorted = [...tools].sort((a, b) => a.provider_id.localeCompare(b.provider_id));

  return (
    <>
      <h1>Tools</h1>
      <DataSource path="memory/ops/providers/*.yaml" layer="Main" />

      <p className="muted">
        The full provider catalog — every adapter BBC knows about. Role agents
        resolve their tool kit through this catalog plus{" "}
        <a href="/bindings">bindings</a>. See ADR-0008 for the role-tool-bundle
        rationale.
      </p>

      <div className="card">
        <div className="row">
          <span><span className="muted">total:</span> {tools.length}</span>
          <span><span className="muted">active:</span> {active}</span>
          <span><span className="muted">candidate:</span> {candidate}</span>
          <span><span className="muted">archived:</span> {archived}</span>
          <span><span className="muted">bound now:</span> {bound}</span>
        </div>
      </div>

      {tools.length === 0 ? (
        <p className="empty">No provider adapters found under <code>memory/ops/providers/</code>.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>provider</th>
              <th>implements</th>
              <th>status</th>
              <th>bound</th>
              <th>key metadata</th>
              <th>tags</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const isBound = boundProviderIds.has(t.provider_id);
              const headlineMeta = pickHeadlineMetadata(t.metadata);
              return (
                <tr key={t.provider_id}>
                  <td><code>{t.provider_id}</code></td>
                  <td>
                    {t.implements.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      t.implements.map((r) => (
                        <code key={r} className="mono-sm" style={{ marginRight: "0.4em" }}>
                          {r}
                        </code>
                      ))
                    )}
                  </td>
                  <td>
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
                  </td>
                  <td>
                    {isBound ? (
                      <span className="pill ok">yes</span>
                    ) : (
                      <span className="muted">no</span>
                    )}
                  </td>
                  <td className="mono-sm">
                    {headlineMeta.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      headlineMeta.map(([k, v]) => (
                        <div key={k}>
                          <span className="muted">{k}:</span> {v}
                        </div>
                      ))
                    )}
                  </td>
                  <td className="mono-sm">
                    {t.tags.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      t.tags.join(", ")
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

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
