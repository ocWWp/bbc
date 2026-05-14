import { describe, it, expect } from "vitest";
import { resolveTemplate } from "./resolve-template";
import { buildGallery } from "./gallery";

describe("resolveTemplate", () => {
  it("resolves a template from every role registry", () => {
    const gallery = buildGallery();
    const seenRoles = new Set<string>();
    for (const t of gallery) {
      const r = resolveTemplate(t.id);
      expect(r, `expected to resolve ${t.id}`).not.toBeNull();
      expect(r!.role).toBe(t.owningRole);
      expect(r!.template.id).toBe(t.id);
      seenRoles.add(r!.role);
    }
    expect(seenRoles.size).toBe(8);
  });

  it("returns null for an unknown id", () => {
    expect(resolveTemplate("marketing:does-not-exist")).toBeNull();
    expect(resolveTemplate("eng:nope")).toBeNull();
  });

  it("returns null for an unprefixed / unroutable id", () => {
    expect(resolveTemplate("garbage")).toBeNull();
  });
});
