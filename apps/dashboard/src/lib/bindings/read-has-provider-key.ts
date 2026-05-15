// Tells whether a tenant can route work to an LLM provider (Anthropic, for
// now). Mirrors the resolution path getAnthropicClient() uses at run time:
// tenant BYOK first, then server env fallback. Used by /home (chat-home) to
// decide whether to show the composer or a Connect-a-provider gate.

import "server-only";
import { hasTenantProviderKey } from "@/lib/secrets/tenant-keys";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function readHasProviderKey(tenantId: string): Promise<boolean> {
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 0) {
    return true;
  }
  const supabase = await getSupabaseServerClient();
  return hasTenantProviderKey(supabase, tenantId, "anthropic");
}
