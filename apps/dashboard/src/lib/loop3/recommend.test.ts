// D-W4-2 acceptance tests for the rule-based recommender.
//
// Per docs/plans/2026-05-12-bbc-launch-plan.md §3 / Week 4:
//   - fixture with `marketing` profile + 0 marketing skills → recommends marketing built-ins
//   - fixture with 5 decisions + no GitHub → recommends GitHub

import { describe, expect, it } from "vitest";
import { recommend, recommendSkills, type Signal } from "./recommend";
import { recommendConnectors } from "./recommend-connector";

function emptySignal(over: Partial<Signal> = {}): Signal {
  return {
    tenant_roles: [],
    installed_skills_by_role: {},
    installed_connectors: new Set(),
    memory_counts_by_type: {},
    ...over,
  };
}

// --------------------------------------------------------------------------
// recommendSkills — role-gap rule
// --------------------------------------------------------------------------

describe("recommendSkills — role gap", () => {
  it("marketing-active tenant with 0 marketing skills recommends the marketing built-in", () => {
    const recs = recommendSkills(
      emptySignal({
        tenant_roles: ["marketing"],
        installed_skills_by_role: { marketing: 0 },
      }),
    );
    expect(recs).toHaveLength(1);
    expect(recs[0].target_kind).toBe("skill");
    expect(recs[0].target_id).toBe("sk_001"); // Launch-post writer
    expect(recs[0].reason_code).toBe("role_gap_marketing");
    expect(recs[0].reason_human).toContain("marketing");
  });

  it("does not recommend when the role already has skills installed", () => {
    const recs = recommendSkills(
      emptySignal({
        tenant_roles: ["marketing"],
        installed_skills_by_role: { marketing: 1 },
      }),
    );
    expect(recs).toHaveLength(0);
  });

  it("multi-role tenant gets one rec per role with zero skills", () => {
    const recs = recommendSkills(
      emptySignal({
        tenant_roles: ["marketing", "engineering", "founder"],
        installed_skills_by_role: { marketing: 0, engineering: 2, founder: 0 },
      }),
    );
    expect(recs.map((r) => r.target_id).sort()).toEqual(["sk_001", "sk_003"]);
  });

  it("empty tenant_roles is treated as 'all 5 roles'", () => {
    const recs = recommendSkills(emptySignal());
    expect(recs).toHaveLength(5);
    const codes = recs.map((r) => r.reason_code);
    expect(codes).toContain("role_gap_marketing");
    expect(codes).toContain("role_gap_engineering");
    expect(codes).toContain("role_gap_founder");
    expect(codes).toContain("role_gap_designer");
    expect(codes).toContain("role_gap_support");
  });

  it("records the observed signal payload for debugging", () => {
    const recs = recommendSkills(
      emptySignal({ tenant_roles: ["founder"], installed_skills_by_role: { founder: 0 } }),
    );
    expect(recs[0].observed_signal).toMatchObject({ role: "founder", installed_count: 0 });
  });
});

// --------------------------------------------------------------------------
// recommendConnectors — memory-signal rules
// --------------------------------------------------------------------------

describe("recommendConnectors — memory signal", () => {
  it("5+ decisions and no GitHub recommends GitHub", () => {
    const recs = recommendConnectors(
      emptySignal({
        memory_counts_by_type: { decision: 5 },
        installed_connectors: new Set(),
      }),
    );
    const github = recs.find((r) => r.target_id === "github");
    expect(github).toBeDefined();
    expect(github?.target_kind).toBe("connector");
    expect(github?.reason_code).toBe("memory_signal_decisions_no_github");
    expect(github?.reason_human).toContain("5");
  });

  it("4 decisions falls below threshold — no GitHub rec", () => {
    const recs = recommendConnectors(
      emptySignal({ memory_counts_by_type: { decision: 4 } }),
    );
    expect(recs.find((r) => r.target_id === "github")).toBeUndefined();
  });

  it("GitHub already installed → no rec even at 100 decisions", () => {
    const recs = recommendConnectors(
      emptySignal({
        memory_counts_by_type: { decision: 100 },
        installed_connectors: new Set(["github"]),
      }),
    );
    expect(recs.find((r) => r.target_id === "github")).toBeUndefined();
  });

  it("5+ notes and no Notion recommends Notion", () => {
    const recs = recommendConnectors(
      emptySignal({ memory_counts_by_type: { note: 7 } }),
    );
    expect(recs.find((r) => r.target_id === "notion")?.reason_code).toBe("memory_signal_notes_no_notion");
  });

  it("2+ products and no Linear recommends Linear", () => {
    const recs = recommendConnectors(
      emptySignal({ memory_counts_by_type: { product: 3 } }),
    );
    expect(recs.find((r) => r.target_id === "linear")?.reason_code).toBe("memory_signal_products_no_linear");
  });

  it("webhook catch-all fires when tenant has 5+ total memory but no webhook installed", () => {
    const recs = recommendConnectors(
      emptySignal({
        memory_counts_by_type: { note: 3, decision: 2, glossary: 1 },
      }),
    );
    expect(recs.find((r) => r.target_id === "webhook-generic")?.reason_code).toBe("no_push_source");
  });

  it("webhook catch-all is silent for an empty tenant", () => {
    const recs = recommendConnectors(emptySignal());
    expect(recs.find((r) => r.target_id === "webhook-generic")).toBeUndefined();
  });

  it("webhook catch-all does not fire when webhook-generic is installed", () => {
    const recs = recommendConnectors(
      emptySignal({
        memory_counts_by_type: { note: 20 },
        installed_connectors: new Set(["webhook-generic"]),
      }),
    );
    expect(recs.find((r) => r.target_id === "webhook-generic")).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
// recommend() — orchestrator
// --------------------------------------------------------------------------

describe("recommend (orchestrator)", () => {
  it("returns skills + connectors merged", () => {
    const recs = recommend(
      emptySignal({
        tenant_roles: ["marketing"],
        installed_skills_by_role: { marketing: 0 },
        memory_counts_by_type: { decision: 10 },
      }),
    );
    const kinds = recs.map((r) => r.target_kind);
    expect(kinds).toContain("skill");
    expect(kinds).toContain("connector");
    expect(recs.some((r) => r.target_id === "sk_001")).toBe(true);
    expect(recs.some((r) => r.target_id === "github")).toBe(true);
  });

  it("returns [] when nothing matches", () => {
    const recs = recommend(
      emptySignal({
        // tenant has skills for every active role
        tenant_roles: ["marketing"],
        installed_skills_by_role: { marketing: 3 },
        // and no memory signal hits any threshold
        memory_counts_by_type: { decision: 1 },
      }),
    );
    expect(recs).toEqual([]);
  });

  it("each recommendation is dedupe-ready (unique target_kind + target_id within one run)", () => {
    const recs = recommend(emptySignal());
    const keys = recs.map((r) => `${r.target_kind}:${r.target_id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
