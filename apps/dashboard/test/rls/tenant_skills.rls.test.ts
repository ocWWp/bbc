import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  seedSkill,
  setupTwoTenants,
  teardownTwoTenants,
  type TwoTenantSetup,
} from "./_helpers";

describe("tenant_skills RLS", () => {
  let setup: TwoTenantSetup;
  let skillInA: string;

  beforeAll(async () => {
    setup = await setupTwoTenants();
    skillInA = await seedSkill(setup.a.tenantId, setup.a.userId, "marketing-launch-post");
    await seedSkill(setup.b.tenantId, setup.b.userId, "marketing-launch-post");
  });

  afterAll(async () => {
    if (setup) await teardownTwoTenants(setup);
  });

  it("user A reads only A's skills", async () => {
    const { data, error } = await setup.a.authedClient.from("tenant_skills").select("id, tenant_id");
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    for (const row of data ?? []) {
      expect(row.tenant_id).toBe(setup.a.tenantId);
    }
  });

  it("user A cannot SELECT B's skills by tenant_id filter", async () => {
    const { data, error } = await setup.a.authedClient
      .from("tenant_skills")
      .select("id")
      .eq("tenant_id", setup.b.tenantId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("user A cannot UPDATE B's skills", async () => {
    const bSkillIds = await setup.b.authedClient.from("tenant_skills").select("id");
    const targetId = bSkillIds.data?.[0]?.id;
    expect(targetId).toBeTruthy();

    const { data, error } = await setup.a.authedClient
      .from("tenant_skills")
      .update({ uninstalled_at: new Date().toISOString() })
      .eq("id", targetId!)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const stillThere = await setup.b.authedClient
      .from("tenant_skills")
      .select("uninstalled_at")
      .eq("id", targetId!)
      .single();
    expect(stillThere.data?.uninstalled_at).toBeNull();
  });

  it("insert with installed_by != auth.uid() is rejected", async () => {
    const { error } = await setup.a.authedClient.from("tenant_skills").insert({
      tenant_id: setup.a.tenantId,
      source_kind: "manual",
      skill_name: "should-fail-mismatched-installer",
      skill_role: "marketing",
      manifest: { bbc: { role: "marketing", kind: "skill", label: "x", hint: "x" } },
      body: "x",
      body_hash: "x",
      installed_by: setup.b.userId,
    });
    expect(error).not.toBeNull();
  });

  it("insert into another tenant is rejected", async () => {
    const { error } = await setup.a.authedClient.from("tenant_skills").insert({
      tenant_id: setup.b.tenantId,
      source_kind: "manual",
      skill_name: "should-fail-cross-tenant",
      skill_role: "marketing",
      manifest: { bbc: { role: "marketing", kind: "skill", label: "x", hint: "x" } },
      body: "x",
      body_hash: "x",
      installed_by: setup.a.userId,
    });
    expect(error).not.toBeNull();
  });

  it("user A can SELECT a known A skill id directly", async () => {
    const { data, error } = await setup.a.authedClient
      .from("tenant_skills")
      .select("id, tenant_id")
      .eq("id", skillInA)
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBe(skillInA);
  });
});
