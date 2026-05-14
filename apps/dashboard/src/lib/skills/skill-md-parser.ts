// SKILL.md-BBC strict parser.
//
// Spec: docs/skill-md-bbc-spec.md (v1.0)
// ADR:  memory/decisions/0011-skill-md-bbc-spec.md
//
// Hand-rolled YAML mini-parser per apps/dashboard/CLAUDE.md ("no js-yaml
// dependency"). Supports the canonical frontmatter shapes shown in the spec.

export const SUPERTAGS = [
  "voice",
  "decision",
  "glossary",
  "vendor",
  "product",
  "team",
  "skill",
  "source_artifact",
  "note",
] as const;
export type Supertag = (typeof SUPERTAGS)[number];

export const ROLES = ["marketing", "founder", "engineering", "designer", "support"] as const;
export type SkillRole = (typeof ROLES)[number];

export const KINDS = ["skill", "template", "action"] as const;
export type SkillKind = (typeof KINDS)[number];

export const INPUT_KINDS = ["text", "select", "url", "file", "brain-pick", "tone"] as const;
export type InputKind = (typeof INPUT_KINDS)[number];

export const CITATION_CONTRACTS = ["required", "encouraged", "none"] as const;
export type CitationContract = (typeof CITATION_CONTRACTS)[number];

export const OUTPUT_KINDS = ["draft", "checklist", "structured-data", "code"] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

export type FirstUseInput = {
  kind: InputKind;
  name: string;
  label: string;
  hint?: string;
  required: boolean;
  default?: string;
  options?: string[];
  brain_type?: Supertag;
};

export type RetrievalDecl = {
  required_types: Supertag[];
  contextual_types: {
    top_k: number;
    types: Supertag[];
  };
};

export type BbcSkill = {
  role: SkillRole;
  kind: SkillKind;
  label: string;
  hint: string;
  first_use_inputs: FirstUseInput[];
  retrieval: RetrievalDecl;
  citation_contract: CitationContract;
  output_kind: OutputKind;
  output_schema?: Record<string, unknown>;
  output_lang?: string;
  version?: string;
  author?: string;
  homepage?: string;
  tags?: string[];
  unknown: Record<string, unknown>;
};

export type Parsed = {
  manifest: BbcSkill;
  body: string;
  body_hash_input: string;
};

export type ParseErrorCode =
  | "BODY_TOO_LARGE"
  | "FRONTMATTER_PARSE_ERROR"
  | "MISSING_BBC_BLOCK"
  | "MISSING_FIELD"
  | "UNKNOWN_ROLE"
  | "UNKNOWN_KIND"
  | "UNKNOWN_INPUT_KIND"
  | "MISSING_SELECT_OPTIONS"
  | "MISSING_BRAIN_TYPE"
  | "UNKNOWN_SUPERTAG"
  | "UNKNOWN_CITATION_CONTRACT"
  | "UNKNOWN_OUTPUT_KIND"
  | "MISSING_OUTPUT_SCHEMA"
  | "INVALID_OUTPUT_SCHEMA"
  | "DUPLICATE_INPUT_NAME"
  | "INVALID_TYPE";

export type ParseError = {
  code: ParseErrorCode;
  field?: string;
  hint: string;
};

const MAX_FILE_BYTES = 256 * 1024;
const SUPERTAG_SET = new Set<string>(SUPERTAGS);

export function parseSkillMd(source: string): Parsed | ParseError {
  if (Buffer.byteLength(source, "utf8") > MAX_FILE_BYTES) {
    return { code: "BODY_TOO_LARGE", hint: "Skill file exceeds 256 KB." };
  }

  const split = splitFrontmatter(source);
  if (!split) {
    return {
      code: "FRONTMATTER_PARSE_ERROR",
      hint: "File must start with a `---` frontmatter delimiter and contain a closing `---`.",
    };
  }
  const { frontmatter, body } = split;

  let raw: unknown;
  try {
    raw = parseYamlMini(frontmatter);
  } catch (e) {
    return {
      code: "FRONTMATTER_PARSE_ERROR",
      hint: e instanceof Error ? e.message : "Unparseable YAML frontmatter.",
    };
  }

  if (!isPlainObject(raw)) {
    return { code: "FRONTMATTER_PARSE_ERROR", hint: "Frontmatter must be a mapping." };
  }
  const metadata = raw["metadata"];
  if (!isPlainObject(metadata)) {
    return {
      code: "MISSING_BBC_BLOCK",
      field: "metadata",
      hint: "Add a `metadata.bbc` block per docs/skill-md-bbc-spec.md.",
    };
  }
  const bbc = metadata["bbc"];
  if (!isPlainObject(bbc)) {
    return {
      code: "MISSING_BBC_BLOCK",
      field: "metadata.bbc",
      hint: "Add a `metadata.bbc` block per docs/skill-md-bbc-spec.md.",
    };
  }

  const validated = validateBbcBlock(bbc);
  if ("code" in validated) return validated;

  return {
    manifest: validated,
    body: body.trimEnd(),
    body_hash_input: body.trim(),
  };
}

function validateBbcBlock(bbc: Record<string, unknown>): BbcSkill | ParseError {
  const recognized = new Set([
    "role",
    "kind",
    "label",
    "hint",
    "first_use_inputs",
    "retrieval",
    "citation_contract",
    "output_kind",
    "output_schema",
    "output_lang",
    "version",
    "author",
    "homepage",
    "tags",
  ]);

  const role = requireField(bbc, "role", "metadata.bbc.role");
  if ("code" in role) return role;
  if (typeof role.value !== "string" || !(ROLES as readonly string[]).includes(role.value)) {
    return {
      code: "UNKNOWN_ROLE",
      field: "metadata.bbc.role",
      hint: `role must be one of: ${ROLES.join(", ")}.`,
    };
  }

  const kind = requireField(bbc, "kind", "metadata.bbc.kind");
  if ("code" in kind) return kind;
  if (typeof kind.value !== "string" || !(KINDS as readonly string[]).includes(kind.value)) {
    return {
      code: "UNKNOWN_KIND",
      field: "metadata.bbc.kind",
      hint: `kind must be one of: ${KINDS.join(", ")}.`,
    };
  }

  const label = requireField(bbc, "label", "metadata.bbc.label");
  if ("code" in label) return label;
  if (typeof label.value !== "string" || label.value.length === 0) {
    return { code: "INVALID_TYPE", field: "metadata.bbc.label", hint: "label must be a non-empty string." };
  }

  const hint = requireField(bbc, "hint", "metadata.bbc.hint");
  if ("code" in hint) return hint;
  if (typeof hint.value !== "string" || hint.value.length === 0) {
    return { code: "INVALID_TYPE", field: "metadata.bbc.hint", hint: "hint must be a non-empty string." };
  }

  if (!("first_use_inputs" in bbc)) {
    return {
      code: "MISSING_FIELD",
      field: "metadata.bbc.first_use_inputs",
      hint: "Add `first_use_inputs: []` if the skill needs no user input.",
    };
  }
  const firstUseInputs = parseFirstUseInputs(bbc["first_use_inputs"]);
  if ("code" in firstUseInputs) return firstUseInputs;

  const retrievalRaw = requireField(bbc, "retrieval", "metadata.bbc.retrieval");
  if ("code" in retrievalRaw) return retrievalRaw;
  const retrieval = parseRetrieval(retrievalRaw.value);
  if ("code" in retrieval) return retrieval;

  const citation = requireField(bbc, "citation_contract", "metadata.bbc.citation_contract");
  if ("code" in citation) return citation;
  if (
    typeof citation.value !== "string" ||
    !(CITATION_CONTRACTS as readonly string[]).includes(citation.value)
  ) {
    return {
      code: "UNKNOWN_CITATION_CONTRACT",
      field: "metadata.bbc.citation_contract",
      hint: `citation_contract must be one of: ${CITATION_CONTRACTS.join(", ")}.`,
    };
  }

  const outputKind = requireField(bbc, "output_kind", "metadata.bbc.output_kind");
  if ("code" in outputKind) return outputKind;
  if (
    typeof outputKind.value !== "string" ||
    !(OUTPUT_KINDS as readonly string[]).includes(outputKind.value)
  ) {
    return {
      code: "UNKNOWN_OUTPUT_KIND",
      field: "metadata.bbc.output_kind",
      hint: `output_kind must be one of: ${OUTPUT_KINDS.join(", ")}.`,
    };
  }

  let outputSchema: Record<string, unknown> | undefined;
  if (outputKind.value === "structured-data") {
    const rawSchema = bbc["output_schema"];
    if (!isPlainObject(rawSchema)) {
      return {
        code: "MISSING_OUTPUT_SCHEMA",
        field: "metadata.bbc.output_schema",
        hint: "output_kind=structured-data requires an output_schema object.",
      };
    }
    const schemaCheck = validateOutputSchema(rawSchema);
    if (schemaCheck) return schemaCheck;
    outputSchema = rawSchema;
  }

  const unknown: Record<string, unknown> = {};
  for (const key of Object.keys(bbc)) {
    if (!recognized.has(key)) unknown[key] = bbc[key];
  }

  const optionalString = (key: string): string | undefined => {
    const v = bbc[key];
    return typeof v === "string" ? v : undefined;
  };
  const optionalStringArray = (key: string): string[] | undefined => {
    const v = bbc[key];
    if (!Array.isArray(v)) return undefined;
    const all = v.every((x) => typeof x === "string");
    return all ? (v as string[]) : undefined;
  };

  return {
    role: role.value as SkillRole,
    kind: kind.value as SkillKind,
    label: label.value,
    hint: hint.value,
    first_use_inputs: firstUseInputs,
    retrieval,
    citation_contract: citation.value as CitationContract,
    output_kind: outputKind.value as OutputKind,
    output_schema: outputSchema,
    output_lang: optionalString("output_lang"),
    version: optionalString("version"),
    author: optionalString("author"),
    homepage: optionalString("homepage"),
    tags: optionalStringArray("tags"),
    unknown,
  };
}

function parseFirstUseInputs(raw: unknown): FirstUseInput[] | ParseError {
  if (!Array.isArray(raw)) {
    return {
      code: "INVALID_TYPE",
      field: "metadata.bbc.first_use_inputs",
      hint: "first_use_inputs must be an array (use `[]` if no inputs).",
    };
  }
  const seen = new Set<string>();
  const out: FirstUseInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    const path = `metadata.bbc.first_use_inputs[${i}]`;
    if (!isPlainObject(entry)) {
      return { code: "INVALID_TYPE", field: path, hint: "Each first_use_inputs entry must be a mapping." };
    }

    const kind = entry["kind"];
    if (typeof kind !== "string") {
      return { code: "MISSING_FIELD", field: `${path}.kind`, hint: "Each input needs a `kind`." };
    }
    if (!(INPUT_KINDS as readonly string[]).includes(kind)) {
      return {
        code: "UNKNOWN_INPUT_KIND",
        field: `${path}.kind`,
        hint: `kind must be one of: ${INPUT_KINDS.join(", ")}.`,
      };
    }

    const name = entry["name"];
    if (typeof name !== "string" || name.length === 0) {
      return { code: "MISSING_FIELD", field: `${path}.name`, hint: "Each input needs a non-empty `name`." };
    }
    if (seen.has(name)) {
      return {
        code: "DUPLICATE_INPUT_NAME",
        field: `${path}.name`,
        hint: `Input name "${name}" appears more than once. Names must be unique.`,
      };
    }
    seen.add(name);

    const label = entry["label"];
    if (typeof label !== "string" || label.length === 0) {
      return { code: "MISSING_FIELD", field: `${path}.label`, hint: "Each input needs a `label`." };
    }

    const input: FirstUseInput = {
      kind: kind as InputKind,
      name,
      label,
      required: entry["required"] === false ? false : true,
    };
    if (typeof entry["hint"] === "string") input.hint = entry["hint"];
    if (typeof entry["default"] === "string") input.default = entry["default"];

    if (kind === "select") {
      const options = entry["options"];
      if (!Array.isArray(options) || options.length === 0 || !options.every((o) => typeof o === "string")) {
        return {
          code: "MISSING_SELECT_OPTIONS",
          field: `${path}.options`,
          hint: "kind=select requires a non-empty `options` array of strings.",
        };
      }
      input.options = options as string[];
    }

    if (kind === "brain-pick") {
      const bt = entry["brain_type"];
      if (typeof bt !== "string" || !SUPERTAG_SET.has(bt)) {
        return {
          code: "MISSING_BRAIN_TYPE",
          field: `${path}.brain_type`,
          hint: `kind=brain-pick requires a brain_type from: ${SUPERTAGS.join(", ")}.`,
        };
      }
      input.brain_type = bt as Supertag;
    }

    out.push(input);
  }
  return out;
}

function parseRetrieval(raw: unknown): RetrievalDecl | ParseError {
  if (!isPlainObject(raw)) {
    return {
      code: "INVALID_TYPE",
      field: "metadata.bbc.retrieval",
      hint: "retrieval must be an object with required_types and contextual_types.",
    };
  }

  const requiredTypesRaw = raw["required_types"];
  if (!Array.isArray(requiredTypesRaw)) {
    return {
      code: "MISSING_FIELD",
      field: "metadata.bbc.retrieval.required_types",
      hint: "required_types must be an array (use `[]` for none).",
    };
  }
  const requiredTypes: Supertag[] = [];
  for (let i = 0; i < requiredTypesRaw.length; i++) {
    const t = requiredTypesRaw[i];
    if (typeof t !== "string" || !SUPERTAG_SET.has(t)) {
      return {
        code: "UNKNOWN_SUPERTAG",
        field: `metadata.bbc.retrieval.required_types[${i}]`,
        hint: `Supertag must be one of: ${SUPERTAGS.join(", ")}.`,
      };
    }
    requiredTypes.push(t as Supertag);
  }

  const ctxRaw = raw["contextual_types"];
  if (!isPlainObject(ctxRaw)) {
    return {
      code: "MISSING_FIELD",
      field: "metadata.bbc.retrieval.contextual_types",
      hint: "contextual_types must be an object with top_k and types.",
    };
  }
  const topK = ctxRaw["top_k"];
  if (typeof topK !== "number" || !Number.isInteger(topK) || topK < 0 || topK > 50) {
    return {
      code: "INVALID_TYPE",
      field: "metadata.bbc.retrieval.contextual_types.top_k",
      hint: "top_k must be an integer in [0, 50].",
    };
  }
  const typesRaw = ctxRaw["types"];
  if (!Array.isArray(typesRaw)) {
    return {
      code: "MISSING_FIELD",
      field: "metadata.bbc.retrieval.contextual_types.types",
      hint: "contextual_types.types must be an array (use `[]` for none).",
    };
  }
  const types: Supertag[] = [];
  for (let i = 0; i < typesRaw.length; i++) {
    const t = typesRaw[i];
    if (typeof t !== "string" || !SUPERTAG_SET.has(t)) {
      return {
        code: "UNKNOWN_SUPERTAG",
        field: `metadata.bbc.retrieval.contextual_types.types[${i}]`,
        hint: `Supertag must be one of: ${SUPERTAGS.join(", ")}.`,
      };
    }
    types.push(t as Supertag);
  }

  return { required_types: requiredTypes, contextual_types: { top_k: topK, types } };
}

const SUPPORTED_SCHEMA_KEYS = new Set([
  "type",
  "properties",
  "required",
  "items",
  "enum",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
]);
const FORBIDDEN_SCHEMA_KEYS = new Set(["$ref", "oneOf", "anyOf", "allOf", "not"]);

function validateOutputSchema(
  schema: Record<string, unknown>,
  path = "metadata.bbc.output_schema",
): ParseError | null {
  for (const key of Object.keys(schema)) {
    if (FORBIDDEN_SCHEMA_KEYS.has(key)) {
      return {
        code: "INVALID_OUTPUT_SCHEMA",
        field: `${path}.${key}`,
        hint: `${key} is not supported in v1.5 (use enums instead of oneOf/anyOf/allOf).`,
      };
    }
    if (!SUPPORTED_SCHEMA_KEYS.has(key)) {
      return {
        code: "INVALID_OUTPUT_SCHEMA",
        field: `${path}.${key}`,
        hint: `Unsupported JSON Schema keyword "${key}". Supported: ${Array.from(SUPPORTED_SCHEMA_KEYS).join(", ")}.`,
      };
    }
  }
  const properties = schema["properties"];
  if (isPlainObject(properties)) {
    for (const [propName, propSchema] of Object.entries(properties)) {
      if (isPlainObject(propSchema)) {
        const sub = validateOutputSchema(propSchema, `${path}.properties.${propName}`);
        if (sub) return sub;
      }
    }
  }
  const items = schema["items"];
  if (isPlainObject(items)) {
    const sub = validateOutputSchema(items, `${path}.items`);
    if (sub) return sub;
  }
  return null;
}

function requireField(
  obj: Record<string, unknown>,
  key: string,
  path: string,
): { value: unknown } | ParseError {
  if (!(key in obj)) {
    return { code: "MISSING_FIELD", field: path, hint: `Field \`${path}\` is required.` };
  }
  return { value: obj[key] };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// =============================================================================
// Frontmatter split + YAML mini-parser
// =============================================================================

function splitFrontmatter(source: string): { frontmatter: string; body: string } | null {
  const trimmed = source.replace(/^﻿/, "");
  if (!trimmed.startsWith("---")) return null;
  const lines = trimmed.split(/\r?\n/);
  if (lines[0].trim() !== "---") return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      const frontmatter = lines.slice(1, i).join("\n");
      const body = lines.slice(i + 1).join("\n");
      return { frontmatter, body };
    }
  }
  return null;
}

type YamlLine = { indent: number; raw: string; lineNo: number };

function parseYamlMini(text: string): unknown {
  const lines: YamlLine[] = [];
  text.split(/\r?\n/).forEach((raw, idx) => {
    const stripped = stripLineComment(raw).replace(/\s+$/, "");
    if (stripped.trim().length === 0) return;
    const indent = stripped.match(/^ */)?.[0].length ?? 0;
    lines.push({ indent, raw: stripped, lineNo: idx + 1 });
  });
  if (lines.length === 0) return {};
  const { value } = parseBlock(lines, 0, lines[0].indent);
  return value;
}

function stripLineComment(raw: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "\\" && (inSingle || inDouble)) {
      i++;
      continue;
    }
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === "#" && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(raw[i - 1])) return raw.slice(0, i);
    }
  }
  return raw;
}

function parseBlock(
  lines: YamlLine[],
  start: number,
  indent: number,
): { value: unknown; next: number } {
  if (start >= lines.length) return { value: null, next: start };
  const first = lines[start];
  if (first.indent < indent) return { value: null, next: start };

  const trimmedFirst = first.raw.trim();
  if (trimmedFirst.startsWith("- ") || trimmedFirst === "-") {
    return parseArray(lines, start, indent);
  }
  return parseMapping(lines, start, indent);
}

function parseMapping(
  lines: YamlLine[],
  start: number,
  indent: number,
): { value: Record<string, unknown>; next: number } {
  const result: Record<string, unknown> = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new Error(
        `unexpected indent at line ${line.lineNo} (got ${line.indent}, expected ${indent})`,
      );
    }
    const trimmed = line.raw.trim();
    if (trimmed.startsWith("- ")) break;

    const colonIdx = findMappingColon(trimmed);
    if (colonIdx < 0) {
      throw new Error(`expected "key:" mapping at line ${line.lineNo}, got: ${trimmed}`);
    }
    const key = unquote(trimmed.slice(0, colonIdx).trim());
    const rest = trimmed.slice(colonIdx + 1).trim();

    if (rest.length > 0) {
      result[key] = parseScalarOrInline(rest, line.lineNo);
      i++;
    } else {
      const nextLine = lines[i + 1];
      if (!nextLine || nextLine.indent <= indent) {
        result[key] = null;
        i++;
      } else {
        const { value, next } = parseBlock(lines, i + 1, nextLine.indent);
        result[key] = value;
        i = next;
      }
    }
  }
  return { value: result, next: i };
}

function parseArray(
  lines: YamlLine[],
  start: number,
  indent: number,
): { value: unknown[]; next: number } {
  const result: unknown[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new Error(`unexpected indent at line ${line.lineNo}`);
    }
    const trimmed = line.raw.trim();
    if (!trimmed.startsWith("-")) break;
    const after = trimmed === "-" ? "" : trimmed.slice(2);

    if (after.length === 0) {
      const nextLine = lines[i + 1];
      if (!nextLine || nextLine.indent <= indent) {
        result.push(null);
        i++;
      } else {
        const { value, next } = parseBlock(lines, i + 1, nextLine.indent);
        result.push(value);
        i = next;
      }
    } else if (findMappingColon(after) >= 0 && !looksLikeJsonInline(after)) {
      const fakeKeyLine: YamlLine = {
        indent: line.indent + 2,
        raw: " ".repeat(line.indent + 2) + after,
        lineNo: line.lineNo,
      };
      const rebuilt: YamlLine[] = [fakeKeyLine, ...lines.slice(i + 1)];
      const { value, next } = parseMapping(rebuilt, 0, line.indent + 2);
      result.push(value);
      i = i + 1 + (next - 1);
    } else {
      result.push(parseScalarOrInline(after, line.lineNo));
      i++;
    }
  }
  return { value: result, next: i };
}

function findMappingColon(s: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && (inSingle || inDouble)) {
      i++;
      continue;
    }
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === ":" && !inSingle && !inDouble) {
      if (i === s.length - 1 || s[i + 1] === " " || s[i + 1] === "\t") return i;
    }
  }
  return -1;
}

function looksLikeJsonInline(s: string): boolean {
  return s.startsWith("[") || s.startsWith("{");
}

function parseScalarOrInline(raw: string, lineNo: number): unknown {
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return parseInlineArray(raw, lineNo);
  }
  if (raw.startsWith("{") && raw.endsWith("}")) {
    return parseInlineMap(raw, lineNo);
  }
  return parseScalar(raw);
}

function parseScalar(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
  return unquote(trimmed);
}

function unquote(s: string): string {
  if (s.length >= 2) {
    if (s.startsWith('"') && s.endsWith('"')) {
      return s.slice(1, -1).replace(/\\(["\\nrt])/g, (_, ch) => {
        switch (ch) {
          case "n":
            return "\n";
          case "r":
            return "\r";
          case "t":
            return "\t";
          default:
            return ch;
        }
      });
    }
    if (s.startsWith("'") && s.endsWith("'")) {
      return s.slice(1, -1).replace(/''/g, "'");
    }
  }
  return s;
}

function parseInlineArray(raw: string, lineNo: number): unknown[] {
  const inner = raw.slice(1, -1).trim();
  if (inner.length === 0) return [];
  const parts = splitInline(inner, lineNo);
  return parts.map((p) => parseScalarOrInline(p.trim(), lineNo));
}

function parseInlineMap(raw: string, lineNo: number): Record<string, unknown> {
  const inner = raw.slice(1, -1).trim();
  if (inner.length === 0) return {};
  const parts = splitInline(inner, lineNo);
  const result: Record<string, unknown> = {};
  for (const part of parts) {
    const colonIdx = findMappingColon(part);
    if (colonIdx < 0) {
      throw new Error(`inline map entry missing colon at line ${lineNo}: ${part}`);
    }
    const k = unquote(part.slice(0, colonIdx).trim());
    const v = parseScalarOrInline(part.slice(colonIdx + 1).trim(), lineNo);
    result[k] = v;
  }
  return result;
}

function splitInline(s: string, lineNo: number): string[] {
  const out: string[] = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let buf = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && (inSingle || inDouble)) {
      buf += c + (s[++i] ?? "");
      continue;
    }
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if ((c === "[" || c === "{") && !inSingle && !inDouble) depth++;
    else if ((c === "]" || c === "}") && !inSingle && !inDouble) depth--;
    if (c === "," && depth === 0 && !inSingle && !inDouble) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  if (depth !== 0 || inSingle || inDouble) {
    throw new Error(`unterminated inline collection at line ${lineNo}: ${s}`);
  }
  if (buf.length > 0) out.push(buf);
  return out;
}
