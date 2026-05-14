// Shared harness for RLS tests against the live Supabase project.
//
// Each test file calls `setupTwoTenants()` once in beforeAll to provision two
// isolated tenants + one owner per tenant on the real DB. Tests assert that
// tenant A's authenticated client cannot read or write tenant B's rows.
//
// The harness uses two unique-prefixed identifiers per run so concurrent
// test runs (or leftover state from a crashed run) cannot collide. Cleanup
// in `teardownTwoTenants()` deletes:
//   - test rows from the 4 new tables (member-policies allow it)
//   - auth.users (cascades to profiles + tenant_members via FKs)
//   - tenants (cascades to memory_files + other owned rows)
//
// Run with: pnpm test:rls
// Required env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "RLS tests require NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY in env",
  );
}

export const serviceClient: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export type TestTenant = {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  userEmail: string;
  userPassword: string;
  authedClient: SupabaseClient;
};

export type TwoTenantSetup = {
  a: TestTenant;
  b: TestTenant;
  runId: string;
};

async function provisionTenant(runId: string, suffix: "a" | "b"): Promise<TestTenant> {
  const tenantSlug = `rls-test-${runId}-${suffix}`;
  const userEmail = `rls-test-${runId}-${suffix}@bbc.test`;
  const userPassword = `rls_${randomUUID()}`;

  const { data: tenantRow, error: tenantErr } = await serviceClient
    .from("tenants")
    .insert({ slug: tenantSlug, name: `RLS test tenant ${suffix.toUpperCase()} (${runId})` })
    .select("id")
    .single();
  if (tenantErr || !tenantRow) {
    throw new Error(`failed to create tenant ${suffix}: ${tenantErr?.message ?? "unknown"}`);
  }

  const { error: inviteErr } = await serviceClient.from("tenant_invitations").insert({
    tenant_id: tenantRow.id,
    provider: "email",
    identifier: userEmail.toLowerCase(),
    role: "admin",
  });
  if (inviteErr) {
    throw new Error(`failed to create invitation for ${suffix}: ${inviteErr.message}`);
  }

  const { data: userData, error: userErr } = await serviceClient.auth.admin.createUser({
    email: userEmail,
    password: userPassword,
    email_confirm: true,
  });
  if (userErr || !userData.user) {
    throw new Error(`failed to create auth user for ${suffix}: ${userErr?.message ?? "unknown"}`);
  }

  const authedClient = createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await authedClient.auth.signInWithPassword({
    email: userEmail,
    password: userPassword,
  });
  if (signInErr) {
    throw new Error(`failed to sign in as ${suffix}: ${signInErr.message}`);
  }

  return {
    tenantId: tenantRow.id,
    tenantSlug,
    userId: userData.user.id,
    userEmail,
    userPassword,
    authedClient,
  };
}

export async function setupTwoTenants(): Promise<TwoTenantSetup> {
  const runId = randomUUID().slice(0, 8);
  const a = await provisionTenant(runId, "a");
  const b = await provisionTenant(runId, "b");
  return { a, b, runId };
}

export async function teardownTwoTenants(setup: TwoTenantSetup): Promise<void> {
  await Promise.all([
    serviceClient.auth.admin.deleteUser(setup.a.userId),
    serviceClient.auth.admin.deleteUser(setup.b.userId),
  ]);
  await serviceClient.from("tenants").delete().in("id", [setup.a.tenantId, setup.b.tenantId]);
}

// Insert helpers using service-role to bypass RLS during fixture setup.
// Tests then assert what authed clients can / can't see or modify.

export async function seedSkill(tenantId: string, ownerUserId: string, skillName: string) {
  const { data, error } = await serviceClient
    .from("tenant_skills")
    .insert({
      tenant_id: tenantId,
      source_kind: "manual",
      skill_name: skillName,
      skill_role: "marketing",
      manifest: { bbc: { role: "marketing", kind: "skill", label: skillName, hint: "rls fixture" } },
      body: "# rls fixture",
      body_hash: "rls_fixture_hash",
      installed_by: ownerUserId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedSkill failed: ${error?.message ?? "unknown"}`);
  return data.id as string;
}

export async function seedConnector(tenantId: string, ownerUserId: string, connectorId: string) {
  const { data, error } = await serviceClient
    .from("tenant_connectors")
    .insert({
      tenant_id: tenantId,
      connector_id: connectorId,
      mapping: {},
      sync_state: {},
      installed_by: ownerUserId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedConnector failed: ${error?.message ?? "unknown"}`);
  return data.id as string;
}

export async function seedRecommendation(
  tenantId: string,
  target: { kind: "skill" | "connector" | "provider"; id: string },
) {
  const { data, error } = await serviceClient
    .from("recommendations")
    .insert({
      tenant_id: tenantId,
      target_kind: target.kind,
      target_id: target.id,
      reason_code: "rls_fixture",
      reason_human: "rls fixture",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedRecommendation failed: ${error?.message ?? "unknown"}`);
  return data.id as string;
}

export async function seedDeadLetter(tenantId: string, connectorRowId: string) {
  const { data, error } = await serviceClient
    .from("webhook_dead_letters")
    .insert({
      tenant_id: tenantId,
      connector_id: connectorRowId,
      reason: "invalid_signature",
      raw_body_sha256: "deadbeef",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedDeadLetter failed: ${error?.message ?? "unknown"}`);
  return data.id as string;
}

export async function seedExternalAccount(tenantId: string, ownerUserId: string, providerId: string) {
  const { data, error } = await serviceClient
    .from("external_accounts")
    .insert({
      tenant_id: tenantId,
      provider_id: providerId,
      kind: "oauth_token",
      secret_ciphertext: Buffer.from("rls_fixture_ciphertext"),
      secret_iv: Buffer.from("rls_fixture_iv___"),
      secret_tag: Buffer.from("rls_fixture_tag"),
      display_hint: "rls fixture",
      created_by: ownerUserId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedExternalAccount failed: ${error?.message ?? "unknown"}`);
  return data.id as string;
}
