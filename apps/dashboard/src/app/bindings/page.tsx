import { readBindings } from "@/lib/read-bindings";
import DataSource from "@/components/DataSource";

export const dynamic = "force-dynamic";

export default async function BindingsPage() {
  const bindings = await readBindings();
  const active = bindings.filter((b) => b.kind === "active").length;
  const provisional = bindings.filter((b) => b.kind === "provisional").length;
  const unbound = bindings.filter((b) => b.kind === "unbound").length;

  return (
    <>
      <h1>Bindings</h1>
      <DataSource path="memory/ops/bindings.yaml" layer="Main" />

      <div className="card">
        <div className="row">
          <span><span className="muted">active:</span> {active}</span>
          <span><span className="muted">provisional:</span> {provisional}</span>
          <span><span className="muted">unbound:</span> {unbound}</span>
        </div>
      </div>

      {bindings.length === 0 ? (
        <p className="empty">bindings.yaml could not be parsed.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>role</th>
              <th>provider</th>
              <th>state</th>
              <th>provisional</th>
              <th>bound_at</th>
              <th>notes</th>
            </tr>
          </thead>
          <tbody>
            {bindings.map((b) => (
              <tr key={b.role}>
                <td><code>{b.role}</code></td>
                <td>{b.kind === "unbound" ? <span className="muted">—</span> : <code>{b.provider}</code>}</td>
                <td>
                  <span className={`pill ${b.kind === "active" ? "ok" : b.kind === "provisional" ? "warn" : "muted"}`}>
                    {b.kind}
                  </span>
                </td>
                <td>
                  {b.kind === "unbound" ? (
                    <span className="muted">—</span>
                  ) : b.provisional ? (
                    <span className="pill warn">yes</span>
                  ) : (
                    <span className="muted">no</span>
                  )}
                </td>
                <td className="mono-sm">{b.bound_at}</td>
                <td className="mono-sm">{b.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
