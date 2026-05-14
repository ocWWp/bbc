import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  FileProposalInput,
  FileProposalResult,
  Proposal,
  ProposalStatus,
  QueueStore,
  WriteResult,
} from "../interfaces";
import { parseFrontmatter, fmString, fmObject } from "./frontmatter";

const execp = promisify(exec);
const execFileP = promisify(execFile);
const PROPOSAL_ID_RE = /^prop_[\w:.-]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POSIX-safe single-quote escape for shelling out arguments. */
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

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

  /**
   * File-mode fileProposal: shells out to scripts/propose.sh via execFile so
   * arguments are passed as a single argv slot each (no shell quoting needed).
   * The body goes via --body-file (a tempfile) because bodies can be long
   * and may contain shell-metacharacters that would otherwise need escaping.
   *
   * --originator is always passed explicitly as `leaf-dashboard`: propose.sh
   * can infer the originator from PWD only when run from inside a
   * distribution/<name>/ or manager/ directory, and the dashboard runs from
   * the repo root.
   */
  async fileProposal(input: FileProposalInput): Promise<FileProposalResult> {
    if (input.source_memory_id && !UUID_RE.test(input.source_memory_id)) {
      return { ok: false, output: `Invalid source_memory_id: ${input.source_memory_id}` };
    }
    if (!input.summary || input.summary.length > 500) {
      return { ok: false, output: "Summary is required (≤ 500 chars)." };
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bbc-prop-"));
    const bodyPath = path.join(tmpDir, "body.md");
    try {
      await fs.writeFile(bodyPath, input.body, "utf8");

      const args = [
        path.join(this.bbcRoot, "scripts", "propose.sh"),
        "--target", input.target_layer ?? "main",
        "--originator", "leaf-dashboard",
        "--file", input.target_file,
        "--kind", input.change_kind,
        "--summary", input.summary,
        "--body-file", bodyPath,
      ];
      if (input.source_memory_id) {
        args.push("--source-memory-id", input.source_memory_id);
      }

      const { stdout, stderr } = await execFileP("bash", args, {
        cwd: this.bbcRoot,
        timeout: 30000,
      });
      const combined = [stdout, stderr].filter(Boolean).join("\n");
      const match = stdout.match(/proposal_id:\s*(\S+)/);
      if (!match) {
        return { ok: false, output: `Could not parse proposal_id from propose.sh output:\n${combined}` };
      }
      return { ok: true, output: combined, id: match[1] };
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      return {
        ok: false,
        output: [err.stdout, err.stderr, err.message].filter(Boolean).join("\n"),
      };
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * File-mode acceptProposal: shells out to scripts/accept.sh. Single-tenant
   * by construction; the host's bbc/ directory is the only state.
   */
  async acceptProposal(proposalId: string, actor: string): Promise<WriteResult> {
    if (!PROPOSAL_ID_RE.test(proposalId)) {
      return { ok: false, output: `Invalid proposal_id: ${proposalId}` };
    }
    const script = path.join(this.bbcRoot, "scripts", "accept.sh");
    try {
      const { stdout, stderr } = await execp(
        `bash ${shq(script)} ${shq(proposalId)} --actor ${shq(actor)}`,
        { cwd: this.bbcRoot, timeout: 30000 },
      );
      return { ok: true, output: [stdout, stderr].filter(Boolean).join("\n") };
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      return {
        ok: false,
        output: [err.stdout, err.stderr, err.message].filter(Boolean).join("\n"),
      };
    }
  }

  async rejectProposal(proposalId: string, actor: string, reason: string): Promise<WriteResult> {
    if (!PROPOSAL_ID_RE.test(proposalId)) {
      return { ok: false, output: `Invalid proposal_id: ${proposalId}` };
    }
    if (!reason || reason.length > 500) {
      return { ok: false, output: "Reason is required (≤ 500 chars)." };
    }
    const script = path.join(this.bbcRoot, "scripts", "reject.sh");
    try {
      const { stdout, stderr } = await execp(
        `bash ${shq(script)} ${shq(proposalId)} --reason ${shq(reason)} --actor ${shq(actor)}`,
        { cwd: this.bbcRoot, timeout: 30000 },
      );
      return { ok: true, output: [stdout, stderr].filter(Boolean).join("\n") };
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      return {
        ok: false,
        output: [err.stdout, err.stderr, err.message].filter(Boolean).join("\n"),
      };
    }
  }
}
