import { listPending } from "@/lib/read-queue";
import { readLog, readLkg, recentLog, countSince } from "@/lib/read-log";
import { BBC } from "@/lib/bbc-paths";
import fs from "node:fs/promises";
import Link from "next/link";
import DataSource from "@/components/DataSource";

/**
 * Read STATE.md, find the FIRST "## Current phase" heading, return only the
 * content until the next "## " heading. Line-based parse — small and obvious.
 */
async function readCurrentPhase(): Promise<string> {
  try {
    const t = await fs.readFile(BBC.state(), "utf8");
    const lines = t.split("\n");
    const start = lines.findIndex((l) => l.trim() === "## Current phase");
    if (start < 0) return "(unknown)";
    const collected: string[] = [];
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].startsWith("## ")) break;
      collected.push(lines[i]);
    }
    return collected.join("\n").trim() || "(empty)";
  } catch {
    return "(unreadable)";
  }
}

export const dynamic = "force-dynamic";

export default async function Overview() {
  const [pending, log, lkg, currentPhase] = await Promise.all([
    listPending(),
    readLog(),
    readLkg(),
    readCurrentPhase(),
  ]);

  const acceptsLast7 = countSince(log, "accept", 7);
  const rejectsLast7 = countSince(log, "reject", 7);
  const proposesLast7 = countSince(log, "propose", 7);
  const latest = recentLog(log, 1)[0];

  const awaitingReview = pending.filter((p) => !p.manager_review).length;
  const readyToAccept = pending.filter((p) => p.manager_review?.verdict === "approved").length;

  return (
    <>
      <h1>Overview</h1>

      <div className="card">
        <div className="row"><span className="label">BBC repo</span><code>{BBC.root}</code></div>
        <div className="row"><span className="label">LKG</span><span>v={lkg}</span></div>
        <DataSource path="_log/lkg.txt" layer="Main" />
      </div>

      <h2>Current phase</h2>
      <div className="card">
        <div className="phase-summary">{currentPhase}</div>
        <DataSource path=".planning/STATE.md" layer="Main" />
      </div>

      <h2>At a glance</h2>
      <div className="grid-stats">
        <Link href="/queue" className="stat">
          <div className="stat-num">{pending.length}</div>
          <div className="stat-label">pending</div>
          <div className="stat-sub">{awaitingReview} awaiting review · {readyToAccept} ready</div>
        </Link>
        <Link href="/log" className="stat">
          <div className="stat-num">{proposesLast7}</div>
          <div className="stat-label">proposed (7d)</div>
        </Link>
        <Link href="/log" className="stat">
          <div className="stat-num">{acceptsLast7}</div>
          <div className="stat-label">accepted (7d)</div>
        </Link>
        <Link href="/log" className="stat">
          <div className="stat-num">{rejectsLast7}</div>
          <div className="stat-label">rejected (7d)</div>
        </Link>
      </div>
      <DataSource path="queue/ + _log/operations.jsonl (last 7d)" layer="Shared" />

      <h2>Last activity</h2>
      {latest ? (
        <div className="card">
          <div className="row">
            <span className="label">v{latest.v}</span>
            <span className="pill">{latest.action}</span>
            <code>{latest.target}</code>
          </div>
          <div className="row">
            <span className="label">{latest.actor}</span>
            <span className="mono-sm">{latest.ts}</span>
          </div>
          <Link href="/log" className="mono-sm">→ full log</Link>
          <DataSource path="_log/operations.jsonl" layer="Main" />
        </div>
      ) : (
        <p className="empty">no log entries.</p>
      )}
    </>
  );
}
