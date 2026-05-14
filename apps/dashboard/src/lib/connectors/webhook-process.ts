// v1.5 D-W3-4: webhook request → memory_files orchestration.
//
// Pulls together verifyRequest + applyMapping + dedup + commit. The route
// handler is a thin shim over this function so the integration logic is
// testable without spinning up Next.js.
//
// Database access is abstracted behind WebhookDb so the orchestration is
// fully unit-testable; the concrete Supabase impl lives next to the route
// handler.

import {
  applyMapping,
  parseMapping,
  verifyRequest,
  checkRateLimit,
  computeSignature,
  type DlqReason,
} from "./webhook-verify";
import type { MemoryProposal } from "./framework";

// Webhook body signature is computed over `${timestamp}.${body}` (per
// verifyRequest). Re-exported for the install drawer's curl-example generator.
export { computeSignature };

// --------------------------------------------------------------------------
// DB port
// --------------------------------------------------------------------------

export type WebhookConnectorRow = {
  id: string;
  tenant_id: string;
  /** Mapping config — passed to parseMapping. */
  mapping: Record<string, unknown>;
  /** Decrypted webhook secret. The route handler decrypts via secret-encryption.ts
   *  before calling this orchestrator so the orchestrator stays crypto-agnostic. */
  secret: string;
  active: boolean;
};

export interface WebhookDb {
  /** Look up the active tenant_connectors row by (tenant_slug, webhook_id).
   *  Returns null if the tenant doesn't exist, the connector doesn't exist,
   *  the connector_id is not 'webhook-generic', or the row is inactive. */
  findConnector(tenant_slug: string, webhook_id: string): Promise<WebhookConnectorRow | null>;

  /** Returns the subset of source_refs already in memory_files for this tenant. */
  existingSourceRefs(tenant_id: string, source_refs: string[]): Promise<Set<string>>;

  /** Insert a memory_files row (status='draft') for the proposal. */
  commitProposal(tenant_id: string, connector_row_id: string, proposal: MemoryProposal): Promise<void>;

  /** Insert a webhook_dead_letters row. raw_body_sha256 lets the user correlate
   *  with their sender's logs without us holding the payload bytes. */
  insertDeadLetter(input: {
    tenant_id: string;
    connector_id: string;
    reason: DlqReason;
    raw_body_sha256: string | null;
    payload: unknown | null;
  }): Promise<void>;

  /** Patch tenant_connectors.last_sync_at + last_sync_status. */
  updateSyncState(
    tenant_id: string,
    connector_id: string,
    patch: { last_sync_at: Date; last_sync_status: "ok" | "rate_limited"; last_sync_error?: string | null },
  ): Promise<void>;
}

// --------------------------------------------------------------------------
// Orchestrator
// --------------------------------------------------------------------------

export type ProcessResult = {
  http_status: number;
  body: Record<string, unknown>;
};

export type ProcessRequestInput = {
  tenant_slug: string;
  webhook_id: string;
  raw_body: Buffer | string;
  signature_header: string | null;
  timestamp_header: string | null;
  content_length: number | null;
  now_ms: number;
  db: WebhookDb;
  /** Hex sha256 of the raw body, for DLQ correlation. Caller computes once;
   *  cheap and lets us avoid a second hash if the request gets DLQ'd later. */
  body_sha256: string;
};

export async function processWebhookRequest(input: ProcessRequestInput): Promise<ProcessResult> {
  const connector = await input.db.findConnector(input.tenant_slug, input.webhook_id);
  if (!connector || !connector.active) {
    // No record exists yet → no row to attach a DLQ entry to. Return 404 so
    // a misconfigured sender knows the URL is wrong (not just rate-limited
    // or whatever).
    return { http_status: 404, body: { error: "not_found" } };
  }

  // 1. Rate-limit (per-tenant, in-memory). Cheap; do it before crypto so a
  //    spammer can't DoS us with bad-signature traffic.
  if (checkRateLimit(connector.tenant_id, input.now_ms)) {
    await input.db.insertDeadLetter({
      tenant_id: connector.tenant_id,
      connector_id: connector.id,
      reason: "rate_limited",
      raw_body_sha256: input.body_sha256,
      payload: null,
    });
    await input.db.updateSyncState(connector.tenant_id, connector.id, {
      last_sync_at: new Date(input.now_ms),
      last_sync_status: "rate_limited",
      last_sync_error: "exceeded 60 req/min",
    });
    return { http_status: 429, body: { error: "rate_limited", retry_after_seconds: 60 } };
  }

  // 2. HMAC + replay + size + JSON parse.
  const verify = verifyRequest({
    raw_body: input.raw_body,
    signature_header: input.signature_header,
    timestamp_header: input.timestamp_header,
    content_length: input.content_length,
    secret: connector.secret,
    now_ms: input.now_ms,
  });
  if (!verify.ok) {
    await input.db.insertDeadLetter({
      tenant_id: connector.tenant_id,
      connector_id: connector.id,
      reason: verify.reason,
      raw_body_sha256: input.body_sha256,
      payload: null,
    });
    return { http_status: verify.http_status, body: { error: verify.reason, message: verify.message } };
  }

  // 3. Parse mapping config from tenant_connectors.mapping.
  const mapping = parseMapping(connector.mapping);
  if (!mapping) {
    await input.db.insertDeadLetter({
      tenant_id: connector.tenant_id,
      connector_id: connector.id,
      reason: "mapping_rejected",
      raw_body_sha256: input.body_sha256,
      payload: verify.body_json,
    });
    return {
      http_status: 400,
      body: { error: "mapping_rejected", message: "tenant_connectors.mapping missing or malformed" },
    };
  }

  // 4. Apply mapping → MemoryProposal.
  const mapped = applyMapping(verify.body_json, mapping);
  if (!mapped.ok) {
    await input.db.insertDeadLetter({
      tenant_id: connector.tenant_id,
      connector_id: connector.id,
      reason: "mapping_rejected",
      raw_body_sha256: input.body_sha256,
      payload: verify.body_json,
    });
    return { http_status: 400, body: { error: "mapping_rejected", message: mapped.message } };
  }

  // 5. Dedup against memory_files.fields.source_ref. Re-delivering the same
  //    webhook (which the spec encourages for at-least-once senders) is a no-op.
  const existing = await input.db.existingSourceRefs(connector.tenant_id, [mapped.proposal.source_ref]);
  if (existing.has(mapped.proposal.source_ref)) {
    await input.db.updateSyncState(connector.tenant_id, connector.id, {
      last_sync_at: new Date(input.now_ms),
      last_sync_status: "ok",
      last_sync_error: null,
    });
    return { http_status: 200, body: { ok: true, deduped: true } };
  }

  // 6. Commit + update connector status.
  await input.db.commitProposal(connector.tenant_id, connector.id, mapped.proposal);
  await input.db.updateSyncState(connector.tenant_id, connector.id, {
    last_sync_at: new Date(input.now_ms),
    last_sync_status: "ok",
    last_sync_error: null,
  });
  return { http_status: 200, body: { ok: true } };
}
