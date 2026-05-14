import { describe, it, expect } from "vitest";
import { buildGallery } from "./gallery";
import { filterGallery } from "./gallery-filter";

describe("buildGallery", () => {
  it("aggregates templates from all 8 role registries", () => {
    const all = buildGallery();
    expect(all.length).toBeGreaterThan(30);
    expect(new Set(all.map((t) => t.owningRole)).size).toBe(8);
  });

  it("derives owningRole from the id prefix and resolves role presentation", () => {
    const all = buildGallery();
    const m = all.find((t) => t.id.startsWith("marketing:"));
    expect(m?.owningRole).toBe("marketing");
    expect(m?.roleLabel).toBeTruthy();
    expect(m?.accentColor).toBeTruthy();
  });

  it("includes the owning role plus any facets in `roles`", () => {
    for (const t of buildGallery()) expect(t.roles).toContain(t.owningRole);
  });
});

describe("filterGallery", () => {
  it("matches query against label and hint, case-insensitive", () => {
    const all = buildGallery();
    const sample = all[0];
    expect(
      filterGallery(all, { query: sample.label.toLowerCase() }).some((t) => t.id === sample.id),
    ).toBe(true);
  });
  it("filters by role, matching owning role OR a facet", () => {
    const all = buildGallery();
    const finance = filterGallery(all, { role: "finance" });
    expect(finance.length).toBeGreaterThan(0);
    expect(finance.every((t) => t.roles.includes("finance"))).toBe(true);
  });
  it("returns all templates when no filters are given", () => {
    const all = buildGallery();
    expect(filterGallery(all, {}).length).toBe(all.length);
  });
});
