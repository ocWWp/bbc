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

export interface QueueStore {
  list(status: ProposalStatus): Promise<Proposal[]>;
  /** Convenience: list all three statuses in parallel. */
  listAll(): Promise<{ pending: Proposal[]; accepted: Proposal[]; rejected: Proposal[] }>;
  getById(proposalId: string): Promise<Proposal | null>;
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
}
