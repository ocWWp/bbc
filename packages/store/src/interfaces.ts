/**
 * BBC storage contracts. One interface, two implementations.
 * - LocalStore: file-mode (markdown + bash), single tenant, reads from disk.
 * - SupabaseStore: DB-mode, multi-tenant, RLS-gated.
 *
 * See ADR-0004 + memory/tech/deployment-modes.md.
 */

export type ProposalStatus = "pending" | "accepted" | "rejected";

export type Proposal = {
  proposal_id: string;
  filename: string; // for file-mode; in DB-mode this is the canonical filename derived from proposal_id
  status: ProposalStatus;
  proposed_by?: string;
  proposed_at?: string;
  target_layer?: string;
  target_file?: string;
  change_kind?: string;
  diff_summary?: string;
  source?: string;
  reject_reason?: string;
  manager_review?: Record<string, string>;
  cross_leaf_impact?: Record<string, string>;
  promotion_check?: Record<string, string>;
  body: string;
};

export type LogEntry = {
  v: number;
  ts: string;
  host?: string; // present in file-mode (per-host); absent or aggregated in DB-mode
  actor: string;
  action: string;
  target: string;
  state_hash?: string;
  lkg_at_emit?: number;
  previous_primary?: string;
};

export type Binding = {
  role: string;
  provider: string;
  bound_at: string;
  notes: string;
  provisional: boolean;
  /** UI styling categorization. */
  kind: "active" | "unbound" | "provisional";
};

/**
 * A provider adapter declared under memory/ops/providers/<id>.yaml.
 * Source of truth for "what tools can BBC bind to a role."
 */
export type Tool = {
  provider_id: string;
  /** Roles this adapter implements (e.g. ["llm-provider"]). From the YAML's `implements:` list. */
  implements: string[];
  /** Lifecycle state. From the YAML's `status:` field. */
  status: "active" | "candidate" | "archived" | "unknown";
  /** Free-text metadata block under "## Metadata" (e.g. model_id, access_method). Key-value strings only. */
  metadata: Record<string, string>;
  /** Raw tags from frontmatter, for filtering. */
  tags: string[];
};

/**
 * Read-only catalog of provider adapters + the role→provider binding resolution.
 * The store is the source of truth; this interface lets role agents (Marketing
 * Studio etc.) ask "what tool am I supposed to use for role X?"
 *
 * Phase L1 (this interface) is read-only. Write paths (proposing a new binding)
 * still go through the queue, not this store.
 */
export interface ToolsStore {
  /** List every provider adapter known to BBC. */
  list(): Promise<Tool[]>;
  /** Resolve the currently-bound provider for a role, if any. Returns null when unbound. */
  resolveRole(role: string): Promise<Tool | null>;
  /** Every provider that declares it `implements: [role]` — i.e. candidates to bind. */
  candidatesFor(role: string): Promise<Tool[]>;
}

export type WriteResult = { ok: true; output: string } | { ok: false; output: string };

export type ChangeKind = "edit" | "add" | "supersede" | "archive" | "flag";

export type FileProposalInput = {
  /** Tenant context — required in DB-mode (passed to propose_change RPC). */
  tenant_id: string;
  /** Path-from-repo-root to the file being proposed against. */
  target_file: string;
  /** What kind of change. `flag` is the v1.5 "raise a concern" affordance. */
  change_kind: ChangeKind;
  /** One-line summary (≤ 500 chars). Used to derive the proposal slug. */
  summary: string;
  /** Full proposal body — markdown, optionally containing a fenced block. */
  body: string;
  /** For kind=flag, the memory_files.id being flagged. */
  source_memory_id?: string;
  /** Which layer the proposal targets. Defaults to "main". */
  target_layer?: "main" | "manager";
};

export type FileProposalResult = WriteResult & { id?: string };

export interface QueueStore {
  list(status: ProposalStatus): Promise<Proposal[]>;
  /** Convenience: list all three statuses in parallel. */
  listAll(): Promise<{ pending: Proposal[]; accepted: Proposal[]; rejected: Proposal[] }>;
  getById(proposalId: string): Promise<Proposal | null>;

  /**
   * File a new proposal (pending).
   *   - LocalStore: shells out to scripts/propose.sh.
   *   - SupabaseStore: invokes propose_change() RPC.
   * Caller identity is determined by the implementation:
   *   - LocalStore: passes --originator leaf-dashboard.
   *   - SupabaseStore: derived from auth.uid() inside the function.
   * Returns the proposal_id on success.
   */
  fileProposal(input: FileProposalInput): Promise<FileProposalResult>;

  /**
   * Flip a proposal pending -> accepted, atomically. The actor string is
   * resolved by the implementation:
   *   - LocalStore: passed via `--actor` to scripts/accept.sh.
   *   - SupabaseStore: derived inside the SQL function from auth.uid().
   * Caller may pass an explicit actor for audit-trail clarity (file-mode
   * uses it; DB-mode ignores and uses session identity).
   */
  acceptProposal(proposalId: string, actor: string): Promise<WriteResult>;

  /**
   * Flip a proposal pending -> rejected with a required reason.
   * Reason is bounded at 500 chars (SQL function checks; LocalStore checks
   * before passing to bash).
   */
  rejectProposal(proposalId: string, actor: string, reason: string): Promise<WriteResult>;
}

export interface LogStore {
  list(): Promise<LogEntry[]>;
  lkg(): Promise<number>;
}

export interface BindingsStore {
  list(): Promise<Binding[]>;
}

export interface Store {
  queue: QueueStore;
  log: LogStore;
  bindings: BindingsStore;
  tools: ToolsStore;
}
