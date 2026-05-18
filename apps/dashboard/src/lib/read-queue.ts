/**
 * Thin shim — preserves the historical export shape so existing pages keep
 * importing from this path. Implementation now lives in @bbc/store; only the
 * exports below are part of the public dashboard contract.
 */
export type { Proposal, ProposalStatus } from "@bbc/store";
import type { Proposal, ProposalStatus } from "@bbc/store";
import { getStore } from "./store";

export async function listPending(limit?: number): Promise<Proposal[]> {
  const store = await getStore();
  const all = await store.queue.list("pending");
  return typeof limit === "number" ? all.slice(0, limit) : all;
}

export async function findById(id: string): Promise<Proposal | null> {
  const store = await getStore();
  // Accept either the proposal_id or its filename derivative.
  const trimmed = id.endsWith(".md") ? id.slice(0, -3) : id;
  return (await store.queue.getById(trimmed)) ?? (await store.queue.getById(id));
}

export function isApproved(p: Proposal): boolean {
  return p.manager_review?.verdict === "approved";
}

export async function readQueueAll() {
  const store = await getStore();
  return store.queue.listAll();
}
