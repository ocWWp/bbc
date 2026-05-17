// Smoke for loadRealProviders() — reads the default example-tenant fixture
// (examples/example-tenant/memory/ops/) so we catch:
//   - filesystem reader regressions
//   - role-mapping coverage (every yaml's `implements:` lands in a known
//     bucket; unknown contracts silently skip)
//   - unbound bindings produce zero connected providers

import { describe, expect, it } from "vitest";
import { loadRealProviders } from "./_providers.server";

describe("loadRealProviders (default example-tenant fixture)", () => {
  it("returns the seven example-* adapters declared in the fixture", async () => {
    const items = await loadRealProviders();
    const names = items.map((p) => p.name).sort();
    expect(names).toEqual([
      "example-analytics",
      "example-api-host",
      "example-db-provider",
      "example-design-source",
      "example-email-delivery",
      "example-llm-provider",
      "example-web-host",
    ]);
  });

  it("maps every adapter's implements[0] to a known role bucket", async () => {
    const items = await loadRealProviders();
    const validRoles = new Set(["llm", "db", "email", "hosting", "analytics", "design", "billing"]);
    for (const item of items) {
      expect(validRoles.has(item.role)).toBe(true);
    }
  });

  it("marks no providers as connected when the fixture has no active bindings", async () => {
    // Acme's bindings.yaml only has one provisional binding + all-unbound;
    // provisional is not 'active', so the loader leaves everything at
    // connected=false. This guards against accidentally treating
    // provisional as connected.
    const items = await loadRealProviders();
    for (const item of items) {
      expect(item.connected).toBe(false);
    }
  });

  it("derives id, glyph, and description from the yaml", async () => {
    const items = await loadRealProviders();
    const llm = items.find((p) => p.name === "example-llm-provider");
    expect(llm).toBeDefined();
    expect(llm?.id).toBe("pr_example-llm-provider");
    expect(llm?.role).toBe("llm");
    expect(llm?.glyph).toBe("E");
    expect(llm?.desc.length).toBeGreaterThan(0);
  });
});
