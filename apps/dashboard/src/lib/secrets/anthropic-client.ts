// Per-tenant Anthropic client factory. Resolves the tenant's BYOK key (if
// set) before falling back to the env var. Every Studio + Welcome server
// action constructs its Anthropic client through this helper so cost
// attribution is consistent and so users with their own keys aren't billed
// against the maintainer's hosted-demo budget.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { resolveTenantProviderKey } from "./tenant-keys";

export type AnthropicClientResolution =
  | {
      ok: true;
      client: Anthropic;
      costAttribution: "tenant_byok" | "hosted_demo_shared";
    }
  | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSupabase = any;

export async function getAnthropicClient(
  supabase: LooseSupabase,
  tenantId: string,
): Promise<AnthropicClientResolution> {
  const envFallback = process.env.ANTHROPIC_API_KEY;
  const resolution = await resolveTenantProviderKey(
    supabase,
    tenantId,
    "anthropic",
    envFallback,
  );
  if (resolution.source === "none") {
    return {
      ok: false,
      error:
        "No Anthropic API key configured. Add one at /settings/keys, or set ANTHROPIC_API_KEY on the server.",
    };
  }
  if (resolution.source === "tenant_byok_decrypt_failed") {
    return {
      ok: false,
      error:
        "Your saved Anthropic key couldn't be decrypted (encryption key may have rotated). Please re-enter it at /settings/keys.",
    };
  }
  const client = new Anthropic({ apiKey: resolution.key });
  return {
    ok: true,
    client,
    costAttribution: resolution.source,
  };
}
