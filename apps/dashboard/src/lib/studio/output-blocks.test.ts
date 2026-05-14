import { describe, expect, it } from "vitest";
import {
  EMIT_OUTPUT_TOOL_INPUT_SCHEMA,
  cleanBlockCitations,
  outputBlockSchema,
  type OutputBlock,
} from "./output-blocks";

const KNOWN = "11111111-1111-4111-8111-111111111111";
const UNKNOWN = "99999999-9999-4999-8999-999999999999";

describe("doc output block", () => {
  it("parses a valid doc block with sections", () => {
    const block = {
      kind: "doc",
      props: {
        title: "ADR-0009: Adopt the doc block kind",
        doc_type: "ADR",
        body_markdown: "Status: Accepted.",
        sections: [
          { heading: "Context", body_markdown: "The four skeleton Studios emitted plaintext." },
          { heading: "Decision", body_markdown: "One typeset doc kind." },
        ],
      },
    };
    const parsed = outputBlockSchema.safeParse(block);
    expect(parsed.success).toBe(true);
  });

  it("parses a valid doc block without sections", () => {
    const parsed = outputBlockSchema.safeParse({
      kind: "doc",
      props: { title: "November board update", doc_type: "Memo", body_markdown: "We hit $58k MRR." },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a doc block missing doc_type", () => {
    const parsed = outputBlockSchema.safeParse({
      kind: "doc",
      props: { title: "Untitled", body_markdown: "body" },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a doc block with empty body_markdown", () => {
    const parsed = outputBlockSchema.safeParse({
      kind: "doc",
      props: { title: "Untitled", doc_type: "Spec", body_markdown: "" },
    });
    expect(parsed.success).toBe(false);
  });

  it("is listed in the Anthropic tool input schema enum", () => {
    const enumValues = (
      EMIT_OUTPUT_TOOL_INPUT_SCHEMA.properties.blocks.items.properties.kind as {
        enum: string[];
      }
    ).enum;
    expect(enumValues).toContain("doc");
  });
});

describe("cleanBlockCitations — doc", () => {
  it("strips unknown citations from title, body, and sections; keeps known ones", () => {
    const block: OutputBlock = {
      kind: "doc",
      props: {
        title: `Spec<cite mem_id="${UNKNOWN}"/>`,
        doc_type: "Spec",
        body_markdown: `Grounded<cite mem_id="${KNOWN}"/> and fabricated<cite mem_id="${UNKNOWN}"/>.`,
        sections: [
          { heading: `Context<cite mem_id="${UNKNOWN}"/>`, body_markdown: `ok<cite mem_id="${KNOWN}"/>` },
        ],
      },
    };
    const { block: cleaned, stripped } = cleanBlockCitations(block, new Set([KNOWN]));
    expect(stripped).toBe(3);
    if (cleaned.kind !== "doc") throw new Error("kind changed");
    expect(cleaned.props.title).not.toContain(UNKNOWN);
    expect(cleaned.props.body_markdown).toContain(KNOWN);
    expect(cleaned.props.body_markdown).not.toContain(UNKNOWN);
    expect(cleaned.props.sections?.[0].heading).not.toContain(UNKNOWN);
    expect(cleaned.props.sections?.[0].body_markdown).toContain(KNOWN);
  });

  it("leaves doc_type untouched (it is a label, not citeable prose)", () => {
    const block: OutputBlock = {
      kind: "doc",
      props: { title: "t", doc_type: "Offer Letter", body_markdown: "body" },
    };
    const { block: cleaned } = cleanBlockCitations(block, new Set());
    if (cleaned.kind !== "doc") throw new Error("kind changed");
    expect(cleaned.props.doc_type).toBe("Offer Letter");
    expect(cleaned.props.sections).toBeUndefined();
  });
});
