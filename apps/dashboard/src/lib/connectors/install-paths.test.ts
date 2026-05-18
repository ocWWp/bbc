import { describe, it, expect } from "vitest";
import { installPathFor } from "./install-paths";

describe("installPathFor", () => {
  it("maps github to /library/install/github", () => {
    expect(installPathFor("github")).toBe("/library/install/github");
  });

  it("maps gmail to /library/install/google", () => {
    expect(installPathFor("gmail")).toBe("/library/install/google");
  });

  it("maps drive to /library/install/google", () => {
    expect(installPathFor("drive")).toBe("/library/install/google");
  });

  it("returns undefined for unknown connector_id", () => {
    expect(installPathFor("notion")).toBeUndefined();
    expect(installPathFor("linear")).toBeUndefined();
    expect(installPathFor("webhook-generic")).toBeUndefined();
    expect(installPathFor("")).toBeUndefined();
  });
});
