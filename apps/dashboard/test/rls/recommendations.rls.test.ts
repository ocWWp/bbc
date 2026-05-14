import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  seedRecommendation,
  setupTwoTenants,
  teardownTwoTenants,
  type TwoTenantSetup,
} from "./_helpers";

describe("recommendations RLS", () => {
  let setup: TwoTenantSetup;
  let recInA: string;
  let recInB: string;

  beforeAll(async () => {
    setup = await setupTwoTenants();
    recInA = await seedRecommendation(setup.a.tenantId, { kind: "skill", id: "marketing-launch-post" });
    recInB = await seedRecommendation(setup.b.tenantId, { kind: "skill", id: "marketing-launch-post" });
  });

  afterAll(async () => {
    if (setup) await teardownTwoTenants(setup);
  });

  it("user A reads only A's recommendations", async () => {
    const { data, error } = await setup.a.authedClient
      .from("recommendations")
      .select("id, tenant_id");
    expect(error).toBeNull();
    for (const row of data ?? []) {
      expect(row.tenant_id).toBe(setup.a.tenantId);
    }
    expect((data ?? []).some((r) => r.id === recInA)).toBe(true);
    expect((data ?? []).some((r) => r.id === recInB)).toBe(false);
  });

  it("authenticated members cannot INSERT (recommender writes via service role)", async () => {
    const { error } = await setup.a.authedClient.from("recommendations").insert({
      tenant_id: setup.a.tenantId,
      target_kind: "skill",
      target_id: "another-skill",
      reason_code: "rls_member_insert_attempt",
      reason_human: "should be rejected",
    });
    expect(error).not.toBeNull();
  });

  it("user A can UPDATE their own recommendation (dismiss)", async () => {
    const { data, error } = await setup.a.authedClient
      .from("recommendations")
      .update({ state: "dismissed", dismissed_at: new Date().toISOString() })
      .eq("id", recInA)
      .select("id, state")
      .single();
    expect(error).toBeNull();
    expect(data?.state).toBe("dismissed");
  });

  it("user A cannot UPDATE B's recommendation", async () => {
    const { data, error } = await setup.a.authedClient
      .from("recommendations")
      .update({ state: "dismissed" })
      .eq("id", recInB)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
