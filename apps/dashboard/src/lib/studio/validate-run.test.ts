import { describe, expect, it } from "vitest";
import { validateRun } from "./validate-run";

const realId = "11111111-1111-4111-8111-111111111111";
const fakeId = "deadbeef-dead-4ead-bead-deadbeefdead";

function xpost(text: string) {
  return { kind: "x_post" as const, props: { text } };
}

describe("validateRun", () => {
  it("strips uncited memory IDs from blocks regardless of contract", () => {
    const r = validateRun({
      blocks: [xpost(`hi<cite mem_id="${realId}"/> and<cite mem_id="${fakeId}"/>`)],
      citedMemoryIds: [realId, fakeId],
      knownMemoryIds: new Set([realId]),
      citationContract: "encouraged",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.droppedCitations).toBe(1);
      expect(r.droppedIds).toBe(1);
      expect(r.citedMemoryIds).toEqual([realId]);
      if (r.blocks[0].kind === "x_post") {
        expect(r.blocks[0].props.text).not.toContain(fakeId);
      }
    }
  });

  it("encouraged contract passes with zero citations", () => {
    const r = validateRun({
      blocks: [xpost("a tweet")],
      citedMemoryIds: [],
      knownMemoryIds: new Set([realId]),
      citationContract: "encouraged",
    });
    expect(r.ok).toBe(true);
  });

  it("required contract fails when zero valid citations remain", () => {
    const r = validateRun({
      blocks: [xpost("a tweet")],
      citedMemoryIds: [fakeId],
      knownMemoryIds: new Set([realId]),
      citationContract: "required",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/citation_contract: required/);
      expect(r.error).toMatch(/1 fabricated/);
    }
  });

  it("required contract passes when at least one valid citation survives", () => {
    const r = validateRun({
      blocks: [xpost(`x<cite mem_id="${realId}"/>`)],
      citedMemoryIds: [realId, fakeId],
      knownMemoryIds: new Set([realId]),
      citationContract: "required",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.citedMemoryIds).toEqual([realId]);
      expect(r.droppedIds).toBe(1);
    }
  });

  it("none contract still strips uncited ids (defense in depth)", () => {
    const r = validateRun({
      blocks: [xpost(`<cite mem_id="${fakeId}"/>`)],
      citedMemoryIds: [fakeId],
      knownMemoryIds: new Set(),
      citationContract: "none",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      if (r.blocks[0].kind === "x_post") {
        expect(r.blocks[0].props.text).not.toContain(fakeId);
      }
    }
  });
});
