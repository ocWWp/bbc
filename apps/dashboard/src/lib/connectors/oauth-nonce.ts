// oauth-nonce.ts -- record + consume single-use OAuth state nonces.
// Consume deletes the row in a single statement so a second consume returns null.

type NonceRow = {
  nonce: string; tenant_id: string; actor_user_id: string;
  provider: string; scopes: string[]; redirect_url: string;
};

type AnyClient = any;

export async function recordNonce(client: AnyClient, input: NonceRow & { ttl_seconds: number }): Promise<void> {
  const expires_at = new Date(Date.now() + input.ttl_seconds * 1000).toISOString();
  const { error } = await client.from("oauth_state_nonces").insert({
    nonce: input.nonce,
    tenant_id: input.tenant_id,
    actor_user_id: input.actor_user_id,
    provider: input.provider,
    scopes: input.scopes,
    redirect_url: input.redirect_url,
    expires_at,
  });
  if (error) throw new Error(`recordNonce: ${error.message ?? "unknown"}`);
}

export async function consumeNonce(client: AnyClient, nonce: string): Promise<NonceRow | null> {
  const { data, error } = await client
    .from("oauth_state_nonces")
    .delete()
    .eq("nonce", nonce)
    .select()
    .single();
  if (error) return null;
  return (data as NonceRow | null) ?? null;
}
