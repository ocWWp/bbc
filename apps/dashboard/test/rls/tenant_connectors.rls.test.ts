import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  seedConnector,
  seedExternalAccount,
  setupTwoTenants,
  teardownTwoTenants,
  type TwoTenantSetup,
} from "./_helpers";

describe("tenant_connectors RLS + composite FK", () => {
  let setup: TwoTenantSetup;
  let extAcctInA: string;
  let extAcctInB: string;

  beforeAll(async () => {
    setup = await setupTwoTenants();
    extAcctInA = await seedExternalAccount(setup.a.tenantId, setup.a.userId, "notion");
    extAcctInB = await seedExternalAccount(setup.b.tenantId, setup.b.userId, "notion");
    await seedConnector(setup.a.tenantId, setup.a.userId, "notion");
    await seedConnector(setup.b.tenantId, setup.b.userId, "notion");
  });

  afterAll(async () => {
    if (setup) await teardownTwoTenants(setup);
  });

  it("user A reads only A's connectors", async () => {
    const { data, error } = await setup.a.authedClient
      .from("tenant_connectors")
      .select("id, tenant_id");
    expect(error).toBeNull();
    for (const row of data ?? []) {
      expect(row.tenant_id).toBe(setup.a.tenantId);
    }
  });

  it("user A cannot UPDATE B's connectors", async () => {
    const bRows = await setup.b.authedClient.from("tenant_connectors").select("id");
    const targetId = bRows.data?.[0]?.id;
    expect(targetId).toBeTruthy();

    const { data, error } = await setup.a.authedClient
      .from("tenant_connectors")
      .update({ last_sync_status: "error", last_sync_error: "rls poke" })
      .eq("id", targetId!)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const stillOk = await setup.b.authedClient
      .from("tenant_connectors")
      .select("last_sync_status")
      .eq("id", targetId!)
      .single();
    expect(stillOk.data?.last_sync_status).toBeNull();
  });

  it("composite FK rejects an external_account_id from another tenant", async () => {
    const { error } = await setup.a.authedClient.from("tenant_connectors").insert({
      tenant_id: setup.a.tenantId,
      connector_id: "should-fail-cross-tenant-fk",
      external_account_id: extAcctInB, // B's external account, A's tenant -> composite FK violation
      installed_by: setup.a.userId,
    });
    expect(error).not.toBeNull();
    expect(error?.message.toLowerCase()).toMatch(/foreign key|violates/);
  });

  it("composite FK accepts the same-tenant external_account_id", async () => {
    const { data, error } = await setup.a.authedClient
      .from("tenant_connectors")
      .insert({
        tenant_id: setup.a.tenantId,
        connector_id: "github",
        external_account_id: extAcctInA,
        installed_by: setup.a.userId,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it("insert with installed_by != auth.uid() is rejected", async () => {
    const { error } = await setup.a.authedClient.from("tenant_connectors").insert({
      tenant_id: setup.a.tenantId,
      connector_id: "linear",
      installed_by: setup.b.userId,
    });
    expect(error).not.toBeNull();
  });
});
