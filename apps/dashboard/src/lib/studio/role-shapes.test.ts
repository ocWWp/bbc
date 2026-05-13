import { describe, expect, it } from "vitest";

// Task 18 of v1.5 launch polish. Each role's default chips must reference
// real templates registered under that role's prefix.

import { ROLE_SHAPES } from "./role-shapes";
import { ROLE_PREFIXES, roleForTemplateId, STUDIO_ROLES } from "./template-id";

// Aggregate every role's registry into one Set of ids. Each role has its
// own list<Role>Templates() function — pull them in via the role's index
// barrel (side-effect imports populate the registry).
import { listTemplateSummaries } from "./templates";
import { listEngTemplates } from "./eng-templates";
import { listFounderTemplates } from "./founder-templates";
import { listDesignerTemplates } from "./designer-templates";
import { listSupportTemplates } from "./support-templates";

function allRegisteredTemplateIds(): Set<string> {
  const ids = new Set<string>();
  for (const t of listTemplateSummaries()) ids.add(t.id);
  for (const t of listEngTemplates()) ids.add(t.id);
  for (const t of listFounderTemplates()) ids.add(t.id);
  for (const t of listDesignerTemplates()) ids.add(t.id);
  for (const t of listSupportTemplates()) ids.add(t.id);
  return ids;
}

describe("ROLE_SHAPES — invariants", () => {
  it("defines a shape for every studio role", () => {
    for (const r of STUDIO_ROLES) {
      expect(ROLE_SHAPES[r]).toBeDefined();
      expect(ROLE_SHAPES[r].role).toBe(r);
      expect(ROLE_SHAPES[r].label.length).toBeGreaterThan(0);
      expect(ROLE_SHAPES[r].accentColor.length).toBeGreaterThan(0);
      expect(ROLE_SHAPES[r].defaultChips.length).toBeGreaterThan(0);
      expect(ROLE_SHAPES[r].sidebarSections.length).toBeGreaterThan(0);
    }
  });

  it("every chip's templateSlug starts with its role's prefix", () => {
    for (const r of STUDIO_ROLES) {
      const prefix = ROLE_PREFIXES[r];
      for (const chip of ROLE_SHAPES[r].defaultChips) {
        expect(chip.templateSlug.startsWith(prefix)).toBe(true);
        expect(roleForTemplateId(chip.templateSlug)).toBe(r);
      }
    }
  });

  it("every chip's templateSlug exists in the role's registered templates", () => {
    const registered = allRegisteredTemplateIds();
    for (const r of STUDIO_ROLES) {
      for (const chip of ROLE_SHAPES[r].defaultChips) {
        expect(
          registered.has(chip.templateSlug),
          `chip ${chip.id} (${chip.templateSlug}) for role ${r} is not registered`,
        ).toBe(true);
      }
    }
  });

  it("chip ids are unique within each role", () => {
    for (const r of STUDIO_ROLES) {
      const ids = ROLE_SHAPES[r].defaultChips.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("accent colors are distinct across roles (so each Studio reads visually distinct)", () => {
    const accents = STUDIO_ROLES.map((r) => ROLE_SHAPES[r].accentColor);
    expect(new Set(accents).size).toBe(accents.length);
  });

  it("sidebar itemsFromBrain functions tolerate an empty brain", () => {
    const emptyBrain = {
      voice: undefined,
      recent_decisions: [],
      vendors: [],
      team: [],
      glossary: undefined,
    } as const;
    for (const r of STUDIO_ROLES) {
      for (const section of ROLE_SHAPES[r].sidebarSections) {
        const items = section.itemsFromBrain(emptyBrain);
        expect(Array.isArray(items)).toBe(true);
        expect(items.length).toBe(0);
      }
    }
  });
});
