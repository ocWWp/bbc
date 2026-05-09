import fs from "node:fs/promises";
import path from "node:path";
import { BBC } from "./bbc-paths";
import { parseFrontmatter, fmString, fmObject } from "./frontmatter";

export type ProposalStatus = "pending" | "accepted" | "rejected";

export type Proposal = {
  proposal_id: string;
  filename: string;
  status: ProposalStatus;
  proposed_by?: string;
  proposed_at?: string;
  target_layer?: string;
  target_file?: string;
  change_kind?: string;
  diff_summary?: string;
  source?: string;
  manager_review?: Record<string, string>;
  cross_leaf_impact?: Record<string, string>;
  promotion_check?: Record<string, string>;
  body: string;
};

async function listMd(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((f) => f.endsWith(".md") && f !== "README.md").sort();
  } catch {
    return [];
  }
}

async function readProposalFile(filePath: string, status: ProposalStatus): Promise<Proposal | null> {
  let text: string;
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
  const { fm, body } = parseFrontmatter(text);
  return {
    proposal_id: fmString(fm, "proposal_id") ?? "(unknown)",
    filename: path.basename(filePath),
    status,
    proposed_by: fmString(fm, "proposed_by"),
    proposed_at: fmString(fm, "proposed_at"),
    target_layer: fmString(fm, "target_layer"),
    target_file: fmString(fm, "target_file"),
    change_kind: fmString(fm, "change_kind"),
    diff_summary: fmString(fm, "diff_summary"),
    source: fmString(fm, "source"),
    manager_review: fmObject(fm, "manager_review"),
    cross_leaf_impact: fmObject(fm, "cross_leaf_impact"),
    promotion_check: fmObject(fm, "promotion_check"),
    body,
  };
}

export async function listPending(): Promise<Proposal[]> {
  const files = await listMd(BBC.queue());
  // Filter out _accepted/_rejected (those are subdirs, listMd already skips)
  const out: Proposal[] = [];
  for (const f of files) {
    const full = path.join(BBC.queue(), f);
    const stat = await fs.stat(full);
    if (!stat.isFile()) continue;
    const p = await readProposalFile(full, "pending");
    if (p) out.push(p);
  }
  return out;
}

export async function listAccepted(limit?: number): Promise<Proposal[]> {
  const files = (await listMd(BBC.accepted())).reverse(); // newest first
  const sliced = typeof limit === "number" ? files.slice(0, limit) : files;
  const out: Proposal[] = [];
  for (const f of sliced) {
    const p = await readProposalFile(path.join(BBC.accepted(), f), "accepted");
    if (p) out.push(p);
  }
  return out;
}

export async function listRejected(limit?: number): Promise<Proposal[]> {
  const files = (await listMd(BBC.rejected())).reverse();
  const sliced = typeof limit === "number" ? files.slice(0, limit) : files;
  const out: Proposal[] = [];
  for (const f of sliced) {
    const p = await readProposalFile(path.join(BBC.rejected(), f), "rejected");
    if (p) out.push(p);
  }
  return out;
}

export async function findById(id: string): Promise<Proposal | null> {
  const sources: Array<[string, ProposalStatus]> = [
    [BBC.queue(), "pending"],
    [BBC.accepted(), "accepted"],
    [BBC.rejected(), "rejected"],
  ];
  for (const [dir, status] of sources) {
    const files = await listMd(dir);
    for (const f of files) {
      const p = await readProposalFile(path.join(dir, f), status);
      if (p && (p.proposal_id === id || p.filename === id || p.filename === `${id}.md`)) {
        return p;
      }
    }
  }
  return null;
}

export function isApproved(p: Proposal): boolean {
  return p.manager_review?.verdict === "approved";
}
