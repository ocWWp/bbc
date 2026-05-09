import { readLog, readLkg } from "@/lib/read-log";
import DataSource from "@/components/DataSource";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type PageProps = { searchParams: Promise<{ offset?: string }> };

export default async function LogPage({ searchParams }: PageProps) {
  const { offset: offStr } = await searchParams;
  const offset = Math.max(0, parseInt(offStr ?? "0", 10) || 0);
  const [log, lkg] = await Promise.all([readLog(), readLkg()]);
  const total = log.length;
  const sorted = log.slice().reverse(); // newest first
  const page = sorted.slice(offset, offset + PAGE_SIZE);

  const nextOff = offset + PAGE_SIZE < total ? offset + PAGE_SIZE : null;
  const prevOff = offset > 0 ? Math.max(0, offset - PAGE_SIZE) : null;

  return (
    <>
      <h1>Operations log</h1>
      <DataSource path="_log/operations.jsonl" layer="Main" />

      <div className="card">
        <div className="row"><span className="label">total entries</span><span>{total}</span></div>
        <div className="row"><span className="label">LKG</span><span>v={lkg}</span></div>
        <div className="row"><span className="label">showing</span><span>{offset + 1}–{Math.min(offset + PAGE_SIZE, total)}</span></div>
      </div>

      {page.length === 0 ? (
        <p className="empty">no log entries.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>v</th>
              <th>ts</th>
              <th>host</th>
              <th>actor</th>
              <th>action</th>
              <th>target</th>
              <th>lkg@emit</th>
            </tr>
          </thead>
          <tbody>
            {page.map((e) => (
              <tr key={e.v}>
                <td>{e.v}</td>
                <td className="mono-sm">{e.ts}</td>
                <td className="mono-sm">{e.host}</td>
                <td>{e.actor}</td>
                <td><span className={`pill ${e.action === "era-promotion" ? "warn" : ""}`}>{e.action}</span></td>
                <td><code>{e.target}</code></td>
                <td>{e.lkg_at_emit ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="actions" style={{ marginTop: 16 }}>
        {prevOff !== null && <a className="btn" href={`/log?offset=${prevOff}`}>← newer</a>}
        {nextOff !== null && <a className="btn" href={`/log?offset=${nextOff}`}>older →</a>}
      </div>
    </>
  );
}
