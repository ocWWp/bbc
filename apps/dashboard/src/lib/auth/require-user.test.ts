import { describe, expect, it } from "vitest";

import type { Actor } from "./require-user";

// Per ADR-0012 + Task 0b: Actor now carries templateSlug for persona-aware nav.
// requireActor() is exercised end-to-end in DOM tests (Task 0c unblocks those);
// here we assert the type contract so callers can rely on templateSlug being
// present on every resolved Actor.

describe("Actor shape includes templateSlug", () => {
  it("templateSlug is a string-or-null property of Actor", () => {
    const a: Actor = {
      user_id: "00000000-0000-0000-0000-000000000000",
      provider: "github",
      identifier: "marketing-user",
      actor: "human:github:marketing-user",
      tenant_id: "00000000-0000-0000-0000-000000000001",
      tenant_slug: "test-tenant",
      role: "member",
      templateSlug: "marketing",
    };
    expect(a.templateSlug).toBe("marketing");
  });

  it("templateSlug accepts null for legacy members without a template", () => {
    const a: Actor = {
      user_id: "00000000-0000-0000-0000-000000000000",
      provider: "email",
      identifier: "legacy@example.com",
      actor: "human:email:legacy@example.com",
      tenant_id: "00000000-0000-0000-0000-000000000001",
      tenant_slug: "test-tenant",
      role: "operator",
      templateSlug: null,
    };
    expect(a.templateSlug).toBeNull();
  });
});
