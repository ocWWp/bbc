// D-W5-4 tests for the Google verification gate transformation.

import { describe, expect, it } from "vitest";
import { applyGoogleVerificationGate, CONNECTORS, type ConnectorItem } from "./_data";

function findById(items: ConnectorItem[], id: string): ConnectorItem {
  const found = items.find((c) => c.id === id);
  if (!found) throw new Error(`no connector ${id}`);
  return found;
}

describe("applyGoogleVerificationGate", () => {
  it("when verified, returns the catalog untouched", () => {
    const out = applyGoogleVerificationGate(CONNECTORS, true);
    expect(out).toBe(CONNECTORS);
  });

  it("when unverified, gmail + drive get the beta badge + unverified_oauth flag", () => {
    const out = applyGoogleVerificationGate(CONNECTORS, false);
    const gmail = findById(out, "co_007");
    const drive = findById(out, "co_006");
    expect(gmail.badge).toBe("beta");
    expect(gmail.unverified_oauth).toBe(true);
    expect(drive.badge).toBe("beta");
    expect(drive.unverified_oauth).toBe(true);
  });

  it("non-Google connectors are unaffected", () => {
    const out = applyGoogleVerificationGate(CONNECTORS, false);
    const notion = findById(out, "co_001");
    const linear = findById(out, "co_003");
    expect(notion.unverified_oauth).toBeUndefined();
    expect(linear.badge).toBe("recommended"); // unchanged
  });

  it("preserves a stronger 'recommended' badge over 'beta'", () => {
    const catalog: ConnectorItem[] = [
      {
        ...findById(CONNECTORS, "co_007"),
        badge: "recommended",
      },
    ];
    const out = applyGoogleVerificationGate(catalog, false);
    expect(out[0].badge).toBe("recommended");
    expect(out[0].unverified_oauth).toBe(true);
  });
});
