// Server-side helpers for resolving a tenant's BYOK secret for a given
// provider. Falls back to the environment variable for self-host / dev where
// the maintainer's env key is the intended path.
//
// The hasTenantProviderKey() helper returns a boolean without decrypting --
// safe to call from a server component to decide whether to prompt for BYOK.

import "server-only";
import { decryptSecret, fromWireSecret } from "./encryption";

// The Supabase client passed in is whatever getSupabaseServerClient() returns;
// we deliberately don't bind it to the generated Database type here because
// migrations 0023/0024/0025 haven't propagated into database.types.ts yet
// (types are regenerated post-staging-apply). The narrowing happens via the
// explicit row types below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSupabase = any;

// Migration 0060 moved these columns from bytea to TEXT (base64). Read them as
// strings and decode via fromWireSecret() before decryptSecret. See the
// storage-encoding note in encryption.ts for the full P0 context.
type EncryptedRow = {
  secret_ciphertext: string;
  secret_iv: string;
  secret_tag: string;
};

export type KeyResolution =
  | { source: "tenant_byok"; key: string }
  | { source: "hosted_demo_shared"; key: string }
  | { source: "tenant_byok_decrypt_failed" }
  | { source: "none" };

export async function hasTenantProviderKey(
  supabase: LooseSupabase,
  tenantId: string,
  providerId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("external_accounts")
    .select("id", { head: false })
    .eq("tenant_id", tenantId)
    .eq("provider_id", providerId)
    .eq("kind", "api_key")
    .eq("status", "active")
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

export async function resolveTenantProviderKey(
  supabase: LooseSupabase,
  tenantId: string,
  providerId: string,
  envFallback: string | undefined,
): Promise<KeyResolution> {
  const { data, error } = await supabase
    .from("external_accounts")
    .select("secret_ciphertext, secret_iv, secret_tag")
    .eq("tenant_id", tenantId)
    .eq("provider_id", providerId)
    .eq("kind", "api_key")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!error && data) {
    const row = data as unknown as EncryptedRow;
    try {
      const key = decryptSecret(
        fromWireSecret({
          ciphertext: row.secret_ciphertext,
          iv: row.secret_iv,
          tag: row.secret_tag,
        }),
      );
      return { source: "tenant_byok", key };
    } catch {
      // Decryption failed (corrupt ciphertext, rotated encryption key, etc).
      // Pre-launch audit P1: previously we fell through to envFallback here,
      // which meant a user whose BYOK ciphertext broke would silently start
      // using the shared hosted-demo key — they'd think they were paying for
      // their own usage, but actually weren't. Now surface as a distinct
      // resolution so the caller can ask the user to re-enter the key.
      return { source: "tenant_byok_decrypt_failed" };
    }
  }

  if (envFallback) {
    return { source: "hosted_demo_shared", key: envFallback };
  }
  return { source: "none" };
}

export function isHostedDemoMode(): boolean {
  return (process.env.BBC_HOSTED_DEMO_MODE ?? "").toLowerCase() === "true";
}
