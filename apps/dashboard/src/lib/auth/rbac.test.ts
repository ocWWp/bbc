import { describe, expect, it } from "vitest";

import { type Actor, type Role, requireRole } from "./require-user";

// Per ADR-0012: admin > operator > member > viewer.
// Unit-only: rank logic. Action-level forbidden tests land alongside each
// action they gate (e.g. memory/actions.rbac.test.ts) once Task 0c clears
// the way for `.test.tsx` discovery.

function makeActor(role: Role): Actor {
  return {
    user_id: "00000000-0000-0000-0000-000000000000",
    provider: "github",
    identifier: `${role}-user`,
    actor: `human:github:${role}-user`,
    tenant_id: "00000000-0000-0000-0000-000000000001",
    tenant_slug: "test-tenant",
    role,
    templateSlug: null,
  };
}

describe("requireRole — ADR-0012 ranks admin > operator > member > viewer", () => {
  it("member cannot satisfy operator", () => {
    const result = requireRole(makeActor("member"), "operator");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.output).toContain("requires operator");
      expect(result.output).toContain("you are member");
    }
  });

  it("operator satisfies operator", () => {
    expect(requireRole(makeActor("operator"), "operator")).toEqual({ ok: true });
  });

  it("admin satisfies operator", () => {
    expect(requireRole(makeActor("admin"), "operator")).toEqual({ ok: true });
  });

  it("viewer satisfies viewer but nothing else", () => {
    expect(requireRole(makeActor("viewer"), "viewer")).toEqual({ ok: true });
    expect(requireRole(makeActor("viewer"), "member").ok).toBe(false);
    expect(requireRole(makeActor("viewer"), "operator").ok).toBe(false);
    expect(requireRole(makeActor("viewer"), "admin").ok).toBe(false);
  });

  it("member satisfies member and viewer but not operator/admin", () => {
    expect(requireRole(makeActor("member"), "viewer")).toEqual({ ok: true });
    expect(requireRole(makeActor("member"), "member")).toEqual({ ok: true });
    expect(requireRole(makeActor("member"), "operator").ok).toBe(false);
    expect(requireRole(makeActor("member"), "admin").ok).toBe(false);
  });

  it("operator satisfies viewer/member/operator but not admin", () => {
    expect(requireRole(makeActor("operator"), "viewer")).toEqual({ ok: true });
    expect(requireRole(makeActor("operator"), "member")).toEqual({ ok: true });
    expect(requireRole(makeActor("operator"), "operator")).toEqual({ ok: true });
    expect(requireRole(makeActor("operator"), "admin").ok).toBe(false);
  });

  it("admin satisfies every role", () => {
    expect(requireRole(makeActor("admin"), "viewer")).toEqual({ ok: true });
    expect(requireRole(makeActor("admin"), "member")).toEqual({ ok: true });
    expect(requireRole(makeActor("admin"), "operator")).toEqual({ ok: true });
    expect(requireRole(makeActor("admin"), "admin")).toEqual({ ok: true });
  });
});
