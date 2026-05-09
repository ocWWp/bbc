import fs from "node:fs/promises";
import path from "node:path";
import type { Proposal, ProposalStatus, QueueStore } from "../interfaces";
import { parseFrontmatter, fmString, fmObject } from "./frontmatter";

export class LocalQueueStore implements QueueStore {
  constructor(private readonly bbcRoot: string) {}

  private dir(status: ProposalStatus): string {
    if (status === "pending") return path.join(this.bbcRoot, "queue");
    if (status === "accepted") return path.join(this.bbcRoot, "queue", "_accepted");
    return path.join(this.bbcRoot, "queue", "_rejected");
  }

  private async listMd(dir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir);
      return entries.filter((f) => f.endsWith(".md") && f !== "README.md").sort();
    } catch {
      return [];
    }
  }

  private async readOne(filePath: string, status: ProposalStatus): Promise<Proposal | null> {
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
      reject_reason: fmString(fm, "reject_reason") ?? fmString(fm, "rejected_reason"),
      manager_review: fmObject(fm, "manager_review"),
      cross_leaf_impact: fmObject(fm, "cross_leaf_impact"),
      promotion_check: fmObject(fm, "promotion_check"),
      body: body.trim(),
    };
  }

  async list(status: ProposalStatus): Promise<Proposal[]> {
    const dir = this.dir(status);
    const files = await this.listMd(dir);
    const results = await Promise.all(
      files.map((f) => this.readOne(path.join(dir, f), status)),
    );
    return results.filter((p): p is Proposal => p !== null);
  }

  async listAll() {
    const [pending, accepted, rejected] = await Promise.all([
      this.list("pending"),
      this.list("accepted"),
      this.list("rejected"),
    ]);
    return { pending, accepted, rejected };
  }

  async getById(proposalId: string): Promise<Proposal | null> {
    for (const status of ["pending", "accepted", "rejected"] as const) {
      const items = await this.list(status);
      const hit = items.find((p) => p.proposal_id === proposalId);
      if (hit) return hit;
    }
    return null;
  }
}
