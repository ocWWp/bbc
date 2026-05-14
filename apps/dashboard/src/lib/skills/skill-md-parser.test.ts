import { describe, expect, it } from "vitest";
import { parseSkillMd, type ParseError } from "./skill-md-parser";

function ok(source: string) {
  const r = parseSkillMd(source);
  if ("code" in r) throw new Error(`expected parse to succeed, got ${r.code} at ${r.field}: ${r.hint}`);
  return r;
}

function err(source: string): ParseError {
  const r = parseSkillMd(source);
  if (!("code" in r)) throw new Error("expected parse to fail, got success");
  return r;
}

const MINIMAL = `---
metadata:
  bbc:
    role: marketing
    kind: skill
    label: "Lowercase rewriter"
    hint: "Use when the user wants existing copy rewritten in our lowercase voice."
    first_use_inputs: []
    retrieval:
      required_types: [voice]
      contextual_types:
        top_k: 0
        types: []
    citation_contract: encouraged
    output_kind: draft
---

# Lowercase rewriter

Rewrite the user's input in our voice.`;

describe("parseSkillMd — happy path", () => {
  it("parses the minimal manifest", () => {
    const { manifest, body } = ok(MINIMAL);
    expect(manifest.role).toBe("marketing");
    expect(manifest.kind).toBe("skill");
    expect(manifest.label).toBe("Lowercase rewriter");
    expect(manifest.first_use_inputs).toEqual([]);
    expect(manifest.retrieval.required_types).toEqual(["voice"]);
    expect(manifest.retrieval.contextual_types).toEqual({ top_k: 0, types: [] });
    expect(manifest.citation_contract).toBe("encouraged");
    expect(manifest.output_kind).toBe("draft");
    expect(body).toContain("Rewrite the user's input");
  });

  it("parses a manifest with full first_use_inputs", () => {
    const source = `---
metadata:
  bbc:
    role: marketing
    kind: skill
    label: "Launch post"
    hint: "for product launches"
    first_use_inputs:
      - kind: text
        name: subject
        label: "What's launching?"
        required: true
      - kind: select
        name: platform
        label: "Where?"
        options: ["x", "linkedin"]
        default: "x"
      - kind: brain-pick
        name: anchor
        label: "Which decision?"
        brain_type: decision
        required: false
    retrieval:
      required_types: []
      contextual_types:
        top_k: 8
        types: [glossary, decision]
    citation_contract: required
    output_kind: draft
---
body`;
    const { manifest } = ok(source);
    expect(manifest.first_use_inputs).toHaveLength(3);
    expect(manifest.first_use_inputs[0]).toMatchObject({ kind: "text", name: "subject", required: true });
    expect(manifest.first_use_inputs[1]).toMatchObject({
      kind: "select",
      name: "platform",
      options: ["x", "linkedin"],
      default: "x",
    });
    expect(manifest.first_use_inputs[2]).toMatchObject({
      kind: "brain-pick",
      name: "anchor",
      brain_type: "decision",
      required: false,
    });
  });

  it("preserves unknown metadata.bbc.* fields on manifest.unknown", () => {
    const source = MINIMAL.replace(
      "    output_kind: draft",
      "    output_kind: draft\n    futurefield: hello\n    another_unknown: [1, 2, 3]",
    );
    const { manifest } = ok(source);
    expect(manifest.unknown).toEqual({ futurefield: "hello", another_unknown: [1, 2, 3] });
  });

  it("parses optional version/author/homepage/tags", () => {
    const source = MINIMAL.replace(
      "    output_kind: draft",
      `    output_kind: draft
    version: "1.0.0"
    author: "BBC core"
    homepage: "https://bbc.tools/skills/x"
    tags: [launch, social]`,
    );
    const { manifest } = ok(source);
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.author).toBe("BBC core");
    expect(manifest.homepage).toBe("https://bbc.tools/skills/x");
    expect(manifest.tags).toEqual(["launch", "social"]);
  });
});

describe("parseSkillMd — error cases", () => {
  it("FRONTMATTER_PARSE_ERROR when no `---` at top", () => {
    expect(err("hello world").code).toBe("FRONTMATTER_PARSE_ERROR");
  });

  it("FRONTMATTER_PARSE_ERROR when no closing `---`", () => {
    expect(err("---\nrole: marketing\n").code).toBe("FRONTMATTER_PARSE_ERROR");
  });

  it("BODY_TOO_LARGE", () => {
    const huge = "---\nmetadata:\n  bbc: {}\n---\n" + "x".repeat(300_000);
    expect(err(huge).code).toBe("BODY_TOO_LARGE");
  });

  it("MISSING_BBC_BLOCK when metadata has no bbc", () => {
    const e = err(`---
metadata:
  other: 1
---
body`);
    expect(e.code).toBe("MISSING_BBC_BLOCK");
  });

  it("MISSING_FIELD for missing required field", () => {
    const noLabel = MINIMAL.replace('    label: "Lowercase rewriter"\n', "");
    const e = err(noLabel);
    expect(e.code).toBe("MISSING_FIELD");
    expect(e.field).toBe("metadata.bbc.label");
  });

  it("UNKNOWN_ROLE for unknown role enum", () => {
    const e = err(MINIMAL.replace("role: marketing", "role: cfo"));
    expect(e.code).toBe("UNKNOWN_ROLE");
  });

  it("UNKNOWN_KIND for unknown kind enum", () => {
    const e = err(MINIMAL.replace("kind: skill", "kind: macro"));
    expect(e.code).toBe("UNKNOWN_KIND");
  });

  it("UNKNOWN_INPUT_KIND for bad input kind", () => {
    const source = MINIMAL.replace(
      "    first_use_inputs: []",
      `    first_use_inputs:
      - kind: bogus
        name: x
        label: "x"`,
    );
    expect(err(source).code).toBe("UNKNOWN_INPUT_KIND");
  });

  it("MISSING_SELECT_OPTIONS when kind=select has no options", () => {
    const source = MINIMAL.replace(
      "    first_use_inputs: []",
      `    first_use_inputs:
      - kind: select
        name: x
        label: "x"`,
    );
    expect(err(source).code).toBe("MISSING_SELECT_OPTIONS");
  });

  it("MISSING_BRAIN_TYPE when kind=brain-pick has no brain_type", () => {
    const source = MINIMAL.replace(
      "    first_use_inputs: []",
      `    first_use_inputs:
      - kind: brain-pick
        name: x
        label: "x"`,
    );
    expect(err(source).code).toBe("MISSING_BRAIN_TYPE");
  });

  it("UNKNOWN_SUPERTAG when brain_type is not a real supertag", () => {
    const source = MINIMAL.replace(
      "    first_use_inputs: []",
      `    first_use_inputs:
      - kind: brain-pick
        name: x
        label: "x"
        brain_type: fakethang`,
    );
    expect(err(source).code).toBe("MISSING_BRAIN_TYPE");
  });

  it("UNKNOWN_SUPERTAG in retrieval.required_types", () => {
    const e = err(MINIMAL.replace("required_types: [voice]", "required_types: [fakethang]"));
    expect(e.code).toBe("UNKNOWN_SUPERTAG");
    expect(e.field).toBe("metadata.bbc.retrieval.required_types[0]");
  });

  it("UNKNOWN_CITATION_CONTRACT", () => {
    const e = err(MINIMAL.replace("citation_contract: encouraged", "citation_contract: maybe"));
    expect(e.code).toBe("UNKNOWN_CITATION_CONTRACT");
  });

  it("UNKNOWN_OUTPUT_KIND", () => {
    const e = err(MINIMAL.replace("output_kind: draft", "output_kind: ascii-art"));
    expect(e.code).toBe("UNKNOWN_OUTPUT_KIND");
  });

  it("MISSING_OUTPUT_SCHEMA when output_kind=structured-data but no schema", () => {
    const e = err(MINIMAL.replace("output_kind: draft", "output_kind: structured-data"));
    expect(e.code).toBe("MISSING_OUTPUT_SCHEMA");
  });

  it("INVALID_OUTPUT_SCHEMA when schema uses forbidden keyword", () => {
    const source = MINIMAL.replace(
      "    output_kind: draft",
      `    output_kind: structured-data
    output_schema:
      type: object
      properties:
        x:
          oneOf: [a]`,
    );
    const e = err(source);
    expect(e.code).toBe("INVALID_OUTPUT_SCHEMA");
    expect(e.hint).toMatch(/oneOf/);
  });

  it("DUPLICATE_INPUT_NAME when two inputs share a name", () => {
    const source = MINIMAL.replace(
      "    first_use_inputs: []",
      `    first_use_inputs:
      - kind: text
        name: shared
        label: "a"
      - kind: text
        name: shared
        label: "b"`,
    );
    expect(err(source).code).toBe("DUPLICATE_INPUT_NAME");
  });

  it("INVALID_TYPE when top_k is out of range", () => {
    const e = err(MINIMAL.replace("top_k: 0", "top_k: 99"));
    expect(e.code).toBe("INVALID_TYPE");
    expect(e.field).toBe("metadata.bbc.retrieval.contextual_types.top_k");
  });
});
