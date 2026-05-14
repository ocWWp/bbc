import { describe, it, expect } from "vitest";
import { resolveStudioEntry } from "./resolve-studio-entry";

describe("resolveStudioEntry", () => {
  it("returns a seed when ?template= matches the page role", () => {
    const seed = resolveStudioEntry("engineering", { template: "eng:adr-draft", task: "decide hosting" });
    expect(seed).toEqual({ templateId: "eng:adr-draft", task: "decide hosting", inputs: {} });
  });
  it("returns undefined for an unknown template id", () => {
    expect(resolveStudioEntry("engineering", { template: "eng:nope" })).toBeUndefined();
  });
  it("returns undefined when the template's owning role != the page role", () => {
    expect(resolveStudioEntry("legal", { template: "eng:adr-draft" })).toBeUndefined();
  });
  it("allows an empty task", () => {
    const seed = resolveStudioEntry("engineering", { template: "eng:adr-draft" });
    expect(seed).toEqual({ templateId: "eng:adr-draft", task: "", inputs: {} });
  });
  it("trims task to the role max length", () => {
    const long = "x".repeat(5000);
    const seed = resolveStudioEntry("engineering", { template: "eng:adr-draft", task: long });
    expect(seed!.task.length).toBe(600); // TASK_MAX_LEN.engineering
  });
  it("returns undefined when no template param is present", () => {
    expect(resolveStudioEntry("engineering", {})).toBeUndefined();
  });
  it("normalizes repeated search params (string[]) to the first value", () => {
    const seed = resolveStudioEntry("engineering", {
      template: ["eng:adr-draft", "eng:rfc-draft"],
      task: ["first", "second"],
    });
    expect(seed).toEqual({ templateId: "eng:adr-draft", task: "first", inputs: {} });
  });
});
