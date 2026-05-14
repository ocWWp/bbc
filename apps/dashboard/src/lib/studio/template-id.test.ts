import { describe, expect, it } from "vitest";
import { listTemplateSummaries } from "@/lib/studio/templates";
import { ROLE_PREFIXES, roleForTemplateId, templateIdsForRole } from "./template-id";

describe("roleForTemplateId", () => {
  it("identifies marketing templates", () => {
    expect(roleForTemplateId("marketing:tweet-thread")).toBe("marketing");
  });

  it("identifies engineering templates", () => {
    expect(roleForTemplateId("eng:adr-draft")).toBe("engineering");
  });

  it("identifies designer templates", () => {
    expect(roleForTemplateId("design:visual-spec")).toBe("designer");
  });

  it("identifies founder templates", () => {
    expect(roleForTemplateId("founder:weekly-recap")).toBe("founder");
  });

  it("identifies support templates", () => {
    expect(roleForTemplateId("support:bug-ack")).toBe("support");
  });

  it("returns null for unprefixed ids (legacy marketing IDs pre-Task-0e)", () => {
    expect(roleForTemplateId("tweet-thread")).toBeNull();
    expect(roleForTemplateId("")).toBeNull();
    expect(roleForTemplateId("unknown")).toBeNull();
  });
});

describe("templateIdsForRole", () => {
  it("returns a LIKE pattern for each role", () => {
    expect(templateIdsForRole("marketing")).toBe("marketing:%");
    expect(templateIdsForRole("engineering")).toBe("eng:%");
    expect(templateIdsForRole("designer")).toBe("design:%");
    expect(templateIdsForRole("founder")).toBe("founder:%");
    expect(templateIdsForRole("support")).toBe("support:%");
  });
});

describe("Marketing template registry is fully prefixed (Task 0e)", () => {
  it("every listed marketing template id starts with 'marketing:'", () => {
    for (const t of listTemplateSummaries()) {
      expect(t.id).toMatch(/^marketing:/);
    }
  });

  it("ROLE_PREFIXES is exhaustive — exactly five roles", () => {
    expect(Object.keys(ROLE_PREFIXES).sort()).toEqual([
      "designer",
      "engineering",
      "founder",
      "marketing",
      "support",
    ]);
  });
});
