import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  seedConnector,
  seedDeadLetter,
  setupTwoTenants,
  teardownTwoTenants,
  type TwoTenantSetup,
} from "./_helpers";

describe("webhook_dead_letters RLS", () => {
  let setup: TwoTenantSetup;
  let dlInA: string;
  let dlInB: string;
  let connectorInA: string;

  beforeAll(async () => {
    setup = await setupTwoTenants();
    connectorInA = await seedConnector(setup.a.tenantId, setup.a.userId, "webhook-generic");
    const connectorInB = await seedConnector(setup.b.tenantId, setup.b.userId, "webhook-generic");
    dlInA = await seedDeadLetter(setup.a.tenantId, connectorInA);
    dlInB = await seedDeadLetter(setup.b.tenantId, connectorInB);
  });

  afterAll(async () => {
    if (setup) await teardownTwoTenants(setup);
  });

  it("user A reads only A's dead letters", async () => {
    const { data, error } = await setup.a.authedClient
      .from("webhook_dead_letters")
      .select("id, tenant_id");
    expect(error).toBeNull();
    for (const row of data ?? []) {
      expect(row.tenant_id).toBe(setup.a.tenantId);
    }
    expect((data ?? []).some((r) => r.id === dlInA)).toBe(true);
    expect((data ?? []).some((r) => r.id === dlInB)).toBe(false);
  });

  it("user A cannot SELECT B's dead letters by tenant_id filter", async () => {
    const { data, error } = await setup.a.authedClient
      .from("webhook_dead_letters")
      .select("id")
      .eq("tenant_id", setup.b.tenantId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("authenticated members cannot INSERT (receiver writes via service role)", async () => {
    const { error } = await setup.a.authedClient.from("webhook_dead_letters").insert({
      tenant_id: setup.a.tenantId,
      connector_id: connectorInA,
      reason: "invalid_signature",
      raw_body_sha256: "rls_member_insert_attempt",
    });
    expect(error).not.toBeNull();
  });

  it("authenticated members cannot UPDATE (no member-update policy)", async () => {
    const { data, error } = await setup.a.authedClient
      .from("webhook_dead_letters")
      .update({ reason: "oversized" })
      .eq("id", dlInA)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
