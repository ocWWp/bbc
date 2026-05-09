import type { SupabaseClient } from "@supabase/supabase-js";
import type { Proposal, ProposalStatus, QueueStore, WriteResult } from "../interfaces";

type QueueRow = {
  proposal_id: string;
  status: ProposalStatus;
  body: string;
  frontmatter: Record<string, unknown>;
  manager_review: Record<string, unknown> | null;
  cross_leaf_impact: Record<string, unknown> | null;
  promotion_check: Record<string, unknown> | null;
  reject_reason: string | null;
};

function rowToProposal(row: QueueRow): Proposal {
  const fm = row.frontmatter as Record<string, string | undefined>;
  return {
    proposal_id: row.proposal_id,
    filename: `${row.proposal_id}.md`,
    status: row.status,
    proposed_by: fm.proposed_by,
    proposed_at: fm.proposed_at,
    target_layer: fm.target_layer,
    target_file: fm.target_file,
    change_kind: fm.change_kind,
    diff_summary: fm.diff_summary,
    source: fm.source,
    reject_reason: row.reject_reason ?? undefined,
    manager_review: (row.manager_review ?? undefined) as Record<string, string> | undefined,
    cross_leaf_impact: (row.cross_leaf_impact ?? undefined) as Record<string, string> | undefined,
    promotion_check: (row.promotion_check ?? undefined) as Record<string, string> | undefined,
    body: row.body,
  };
}

const PROPOSAL_ID_RE = /^prop_[\w:.-]+$/;

export class SupabaseQueueStore implements QueueStore {
  constructor(private readonly client: SupabaseClient) {}

  async list(status: ProposalStatus): Promise<Proposal[]> {
    const { data, error } = await this.client
      .from("queue_items")
      .select(
        "proposal_id,status,body,frontmatter,manager_review,cross_leaf_impact,promotion_check,reject_reason",
      )
      .eq("status", status)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`SupabaseQueueStore.list(${status}): ${error.message}`);
    return (data as QueueRow[]).map(rowToProposal);
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
    const { data, error } = await this.client
      .from("queue_items")
      .select(
        "proposal_id,status,body,frontmatter,manager_review,cross_leaf_impact,promotion_check,reject_reason",
      )
      .eq("proposal_id", proposalId)
      .maybeSingle();
    if (error) throw new Error(`SupabaseQueueStore.getById: ${error.message}`);
    if (!data) return null;
    return rowToProposal(data as QueueRow);
  }

  /**
   * DB-mode acceptProposal: invokes the SQL function via PostgREST RPC.
   * Atomicity, role gating, and audit-trail are enforced inside the function.
   * The `actor` parameter is ignored — the SQL function derives it from
   * auth.uid() to prevent client-side spoofing.
   */
  async acceptProposal(proposalId: string, _actor: string): Promise<WriteResult> {
    if (!PROPOSAL_ID_RE.test(proposalId)) {
      return { ok: false, output: `Invalid proposal_id: ${proposalId}` };
    }
    const { error } = await this.client.rpc("accept_proposal", { p_proposal_id: proposalId });
    if (error) return { ok: false, output: error.message };
    return { ok: true, output: `accepted ${proposalId}` };
  }

  async rejectProposal(proposalId: string, _actor: string, reason: string): Promise<WriteResult> {
    if (!PROPOSAL_ID_RE.test(proposalId)) {
      return { ok: false, output: `Invalid proposal_id: ${proposalId}` };
    }
    if (!reason || reason.length > 500) {
      return { ok: false, output: "Reason is required (≤ 500 chars)." };
    }
    const { error } = await this.client.rpc("reject_proposal", {
      p_proposal_id: proposalId,
      p_reason: reason,
    });
    if (error) return { ok: false, output: error.message };
    return { ok: true, output: `rejected ${proposalId}` };
  }
}
