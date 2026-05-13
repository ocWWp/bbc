// v1.5 D-W3-4: generic webhook ingestion endpoint.
//
// POST /api/v1/webhooks/[tenant]/[webhook_id]
//
//   Headers:
//     X-BBC-Signature: sha256=<hex>   HMAC-SHA256 over `${timestamp}.${body}`
//     X-BBC-Timestamp: <unix_ms>      5-min replay window
//     Content-Type: application/json  (cap: 1MB)
//
//   Returns 200 on accepted, 4xx on rejection (see webhook-process for
//   the exact mapping). Every rejection writes a webhook_dead_letters row.
//
// This route handler is the thin Supabase-and-Next shim around the testable
// orchestration in `@/lib/connectors/webhook-process`.

import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/secrets/encryption";
import { processWebhookRequest, type WebhookDb, type WebhookConnectorRow } from "@/lib/connectors/webhook-process";
import type { MemoryProposal } from "@/lib/connectors/framework";
import type { DlqReason } from "@/lib/connectors/webhook-verify";

// Untyped client — database.types.ts is stale relative to the W1-2 migrations
// (tenant_connectors, webhook_dead_letters land in 0034/0036 but aren't yet in
// the generated types). Matches the pattern in read-tenant-skills.ts. Re-gen
// is on the punch list once Supabase MCP is reconnected.
function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("webhook route misconfigured: missing SUPABASE_URL or SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function makeWebhookDb(supabase: SupabaseClient): WebhookDb {
  return {
    async findConnector(tenant_slug, webhook_id): Promise<WebhookConnectorRow | null> {
      // UUID shape gate — Postgres .eq on uuid will error on non-uuid input.
      if (!/^[0-9a-fA-F-]{36}$/.test(webhook_id)) return null;

      const { data: tenant } = await supabase
        .from("tenants")
        .select("id")
        .eq("slug", tenant_slug)
        .maybeSingle();
      if (!tenant) return null;

      const { data: row } = await supabase
        .from("tenant_connectors")
        .select("id, tenant_id, mapping, webhook_secret_ciphertext, webhook_secret_iv, webhook_secret_tag, active, connector_id")
        .eq("tenant_id", tenant.id)
        .eq("id", webhook_id)
        .eq("connector_id", "webhook-generic")
        .maybeSingle();
      if (!row || !row.active) return null;
      if (!row.webhook_secret_ciphertext || !row.webhook_secret_iv || !row.webhook_secret_tag) return null;

      let secret: string;
      try {
        secret = decryptSecret({
          ciphertext: Buffer.from(row.webhook_secret_ciphertext as unknown as string, "base64"),
          iv: Buffer.from(row.webhook_secret_iv as unknown as string, "base64"),
          tag: Buffer.from(row.webhook_secret_tag as unknown as string, "base64"),
        });
      } catch {
        return null;
      }

      return {
        id: row.id,
        tenant_id: row.tenant_id,
        mapping: (row.mapping as Record<string, unknown>) ?? {},
        secret,
        active: row.active,
      };
    },

    async existingSourceRefs(tenant_id, source_refs) {
      if (source_refs.length === 0) return new Set();
      const { data } = await supabase
        .from("memory_files")
        .select("fields")
        .eq("tenant_id", tenant_id)
        .in("fields->>source_ref", source_refs);
      const out = new Set<string>();
      for (const r of data ?? []) {
        const ref = (r.fields as { source_ref?: unknown } | null)?.source_ref;
        if (typeof ref === "string") out.add(ref);
      }
      return out;
    },

    async commitProposal(tenant_id, _connector_id, proposal: MemoryProposal) {
      const slug = `webhook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await supabase.from("memory_files").insert({
        tenant_id,
        type: proposal.type,
        title: proposal.title,
        slug,
        status: "draft",
        fields: proposal.fields,
        body_blocks: [],
        path: `memory/${proposal.type}/${slug}.md`,
        content: proposal.body,
      });
    },

    async insertDeadLetter(input: {
      tenant_id: string;
      connector_id: string;
      reason: DlqReason;
      raw_body_sha256: string | null;
      payload: unknown | null;
    }) {
      await supabase.from("webhook_dead_letters").insert({
        tenant_id: input.tenant_id,
        connector_id: input.connector_id,
        reason: input.reason,
        raw_body_sha256: input.raw_body_sha256,
        payload: input.payload === null ? null : (input.payload as object),
      });
    },

    async updateSyncState(tenant_id, connector_id, patch) {
      await supabase
        .from("tenant_connectors")
        .update({
          last_sync_at: patch.last_sync_at.toISOString(),
          last_sync_status: patch.last_sync_status,
          last_sync_error: patch.last_sync_error ?? null,
        })
        .eq("tenant_id", tenant_id)
        .eq("id", connector_id);
    },
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenant: string; webhook_id: string }> },
): Promise<NextResponse> {
  const { tenant, webhook_id } = await params;

  const contentLengthHeader = req.headers.get("content-length");
  const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : null;

  let raw: Buffer;
  try {
    const ab = await req.arrayBuffer();
    raw = Buffer.from(ab);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const bodySha = createHash("sha256").update(raw).digest("hex");
  const db = makeWebhookDb(adminClient());

  const result = await processWebhookRequest({
    tenant_slug: tenant,
    webhook_id,
    raw_body: raw,
    signature_header: req.headers.get("x-bbc-signature"),
    timestamp_header: req.headers.get("x-bbc-timestamp"),
    content_length: Number.isFinite(contentLength) ? contentLength : null,
    now_ms: Date.now(),
    body_sha256: bodySha,
    db,
  });

  return NextResponse.json(result.body, { status: result.http_status });
}
