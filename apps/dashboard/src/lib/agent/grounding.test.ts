import { describe, it, expect } from "vitest";
import { verifyGrounding } from "./grounding";

describe("GroundingVerifier", () => {
  it("keeps a sentence whose [mem:id] resolves to a retrieved id", () => {
    const r = verifyGrounding("Churn rose 12% [mem:m0042].", ["m0042"]);
    expect(r.text).toBe("Churn rose 12% [mem:m0042].");
    expect(r.citations).toEqual(["m0042"]);
    expect(r.ungroundedClaims).toEqual([]);
  });

  it("strips a sentence whose [mem:id] is NOT in the retrieved set", () => {
    const r = verifyGrounding("Churn rose 12% [mem:m9999].", ["m0042"]);
    expect(r.text).not.toContain("m9999");
    expect(r.citations).toEqual([]);
    expect(r.ungroundedClaims.length).toBe(1);
  });

  it("emits a 'related memories' fallback when a sentence got downgraded", () => {
    const r = verifyGrounding("Churn rose 12%. [mem:m9999]", ["m0042"]);
    expect(r.text).toMatch(/related memories|couldn't ground/i);
  });

  it("keeps sentences with NO memory marker (free assertions are allowed)", () => {
    // The verifier's contract is: claims that CITE memory must cite real
    // memory. Claims with no citation marker pass through unchanged —
    // those are inference-level or voice-level utterances, gated by
    // [inference:] markers if applicable.
    const r = verifyGrounding("Welcome back.", []);
    expect(r.text).toBe("Welcome back.");
    expect(r.citations).toEqual([]);
    expect(r.ungroundedClaims).toEqual([]);
  });

  it("passes [inference: tentative] markers through unchanged", () => {
    const r = verifyGrounding(
      "This [inference: tentative] may be seasonality.",
      [],
    );
    expect(r.text).toContain("[inference: tentative]");
    expect(r.ungroundedClaims).toEqual([]);
  });

  it("preserves multiple valid citations across sentences", () => {
    const r = verifyGrounding(
      "Voice is plain [mem:m0042]. The team prefers Anthropic [mem:m0050].",
      ["m0042", "m0050"],
    );
    expect(r.text).toContain("[mem:m0042]");
    expect(r.text).toContain("[mem:m0050]");
    expect(new Set(r.citations)).toEqual(new Set(["m0042", "m0050"]));
  });

  it("strips a mixed sentence whose markers include an invalid id", () => {
    // Strict policy: ANY invalid marker in a sentence downgrades the
    // whole sentence. We do not surgically remove just the bad chip,
    // because the surrounding claim cannot be vouched for once a fake id
    // appears alongside.
    const r = verifyGrounding(
      "Churn rose 12% [mem:m0042] [mem:m9999].",
      ["m0042"],
    );
    expect(r.citations).toEqual([]);
    expect(r.ungroundedClaims.length).toBe(1);
  });

  it("deduplicates citations across sentences", () => {
    const r = verifyGrounding(
      "First [mem:m0042]. Again [mem:m0042].",
      ["m0042"],
    );
    expect(r.citations).toEqual(["m0042"]);
  });
});
