"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  encryptSecret,
  makeDisplayHint,
  validateProviderKey,
} from "@/lib/secrets/encryption";

/**
 * SECURITY:
 * - Member role required for all three actions.
 * - listProviderKeys never returns ciphertext, iv, or tag -- only the
 *   display hint and metadata. Secrets are write-only from the client.
 * - setProviderKey validates the secret shape per provider before encryption
 *   to reject obvious typos and avoid storing junk.
 * - The unique partial index on (tenant_id, provider_id, kind) WHERE status =
 *   'active' guarantees at most one active key per slot per tenant; we
 *   sequence revoke-then-insert to respect it.
 */

const PROVIDER_ID_RE = /^[a-z][a-z0-9_-]{0,40}$/;

const setProviderKeyInputSchema = z.object({
  providerId: z.string().regex(PROVIDER_ID_RE),
  kind: z.enum(["api_key", "oauth_token", "connection_string"]),
  plaintext: z.string().min(8).max(2000),
});

export type SetProviderKeyInput = z.infer<typeof setProviderKeyInputSchema>;

export type SetProviderKeyResult =
  | { ok: true; externalAccountId: string; displayHint: string }
  | { ok: false; error: string };

const EXTERNAL_ACCOUNT_ID_RE = /^[0-9a-fA-F-]{36}$/;

export async function setProviderKey(
  input: SetProviderKeyInput,
): Promise<SetProviderKeyResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "operator");
  if (!r.ok) return { ok: false, error: r.output };

  const parsed = setProviderKeyInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid input: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    };
  }
  const { providerId, kind, plaintext } = parsed.data;

  if (kind === "api_key" && !validateProviderKey(providerId, plaintext)) {
    return {
      ok: false,
      error: `That doesn't look like a valid ${providerId} key. Double-check the prefix and length.`,
    };
  }

  let encrypted;
  try {
    encrypted = encryptSecret(plaintext);
  } catch (e) {
    const m = e instanceof Error ? e.message : "unknown";
    return { ok: false, error: `Encryption failed: ${m}` };
  }

  const supabase = await getSupabaseServerClient();
  const tenantId = a.actor.tenant_id;
  const userId = a.actor.user_id;
  const nowIso = new Date().toISOString();

  // Revoke any existing active row before inserting the new one -- the
  // unique partial index forbids two active rows in the same slot.
  const { error: revokeErr } = await supabase
    .from("external_accounts")
    .update({ status: "revoked", revoked_at: nowIso })
    .eq("tenant_id", tenantId)
    .eq("provider_id", providerId)
    .eq("kind", kind)
    .eq("status", "active");
  if (revokeErr) {
    return { ok: false, error: `Could not revoke prior key: ${revokeErr.message}` };
  }

  const displayHint = makeDisplayHint(plaintext);

  const { data, error } = await supabase
    .from("external_accounts")
    .insert({
      tenant_id: tenantId,
      provider_id: providerId,
      kind,
      secret_ciphertext: encrypted.ciphertext,
      secret_iv: encrypted.iv,
      secret_tag: encrypted.tag,
      display_hint: displayHint,
      status: "active",
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not save key." };
  }

  revalidatePath("/settings/keys");
  revalidatePath("/welcome");
  return {
    ok: true,
    externalAccountId: (data as { id: string }).id,
    displayHint,
  };
}

export async function revokeProviderKey(
  externalAccountId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "operator");
  if (!r.ok) return { ok: false, error: r.output };

  if (!EXTERNAL_ACCOUNT_ID_RE.test(externalAccountId)) {
    return { ok: false, error: "Invalid id." };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("external_accounts")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", externalAccountId)
    .eq("tenant_id", a.actor.tenant_id)
    .eq("created_by", a.actor.user_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/keys");
  return { ok: true };
}

export type ProviderKeySummary = {
  id: string;
  providerId: string;
  kind: "api_key" | "oauth_token" | "connection_string";
  displayHint: string;
  status: "active" | "revoked";
  createdAt: string;
  revokedAt: string | null;
};

export async function listProviderKeys(): Promise<
  { ok: true; keys: ProviderKeySummary[] } | { ok: false; error: string }
> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("external_accounts")
    .select("id, provider_id, kind, display_hint, status, created_at, revoked_at")
    .eq("tenant_id", a.actor.tenant_id)
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message };

  type Row = {
    id: string;
    provider_id: string;
    kind: ProviderKeySummary["kind"];
    display_hint: string | null;
    status: ProviderKeySummary["status"];
    created_at: string;
    revoked_at: string | null;
  };
  return {
    ok: true,
    keys: ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      providerId: r.provider_id,
      kind: r.kind,
      displayHint: r.display_hint ?? "",
      status: r.status,
      createdAt: r.created_at,
      revokedAt: r.revoked_at,
    })),
  };
}
