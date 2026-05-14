# SKILL.md-BBC — the import contract

**Version:** 1.0 (v1.5 launch)
**Status:** Accepted. Implementation: `apps/dashboard/src/lib/skills/skill-md-parser.ts` (W2-2).
**Governance:** [ADR-0011](../memory/decisions/0011-skill-md-bbc-spec.md). Breaking changes require a superseding ADR.

This doc is the **normative reference** for authors writing skills BBC will import. If you've seen Anthropic's [SKILL.md](https://github.com/anthropics/skills) format, this is a strict superset: BBC accepts the same file structure plus a required `metadata.bbc.*` block that fills in the BBC-specific fields. Without that block, the import is rejected.

## §1 — File shape

A skill is a single Markdown file with YAML frontmatter. Total size ≤ 256 KB.

```markdown
---
# YAML frontmatter
name: "human-readable name"
metadata:
  bbc:
    # required fields, defined in §3
    role: marketing | founder | engineering | designer | support
    kind: skill | template | action
    # ...
---

# Body (Markdown)

Free-form instructions, examples, and constraints. Interpolated into the prompt
at run time, wrapped in BBC-controlled framing.
```

There is no body schema. The body is treated as opaque prompt material wrapped in a system prompt scaffold the host (BBC) controls — see §6.

## §2 — Identifier

The skill identifier is the **relative path** in the source repository, normalized to a slug:

- `skills/marketing/launch-post.md` → `marketing/launch-post`
- `pricing-page-rewrite.md` → `pricing-page-rewrite`

Slug rules: lowercase, slashes preserved as namespace separators, ascii letters/digits/dashes only. Maximum 80 chars total.

Re-importing a skill with a different `source_commit` (the git SHA at import time) soft-deletes the prior row in `tenant_skills` and inserts a new active row. Identifier collisions within a single tenant are blocked by the partial unique index `tenant_skills_active_unique_idx` (see migration 0033).

## §3 — Required `metadata.bbc.*` fields

Every importable skill MUST set all of the following. Missing any one → reject with `MISSING_FIELD: metadata.bbc.<field>`.

### `role` (string, enum)

Which studio agent owns this skill. **One of:** `marketing` · `founder` · `engineering` · `designer` · `support`. Reject with `UNKNOWN_ROLE` if outside this set.

The skill will appear in that role's studio only. There is no dynamic studio creation in v1.5 — the 5 role agents are fixed.

### `kind` (string, enum)

How BBC invokes the skill. **One of:**

- `skill` — autonomous generator. The role agent picks it from a list and runs end-to-end. (Most common.)
- `template` — operator-initiated. Surfaced as a card the user clicks before running. Same execution path, different surface.
- `action` — tool-style. Single output, no draft/review cycle. Examples: "lint this paragraph for voice", "extract supertags from this URL".

### `label` (string, ≤ 64 chars)

Human-readable name shown in the Library card. Title-cased. e.g. `"Launch announcement post"`.

### `hint` (string, ≤ 200 chars)

One-sentence description shown in the Library card and used by the role agent's selection prompt to decide when to invoke. Lead with the **when**, not the **what**. e.g. `"Use when the user wants a short product-launch post for X or LinkedIn."`

### `first_use_inputs` (array, may be empty)

Inputs collected from the user before the first run. After the first run, BBC remembers the answers for the next session unless the user clears them. Each entry:

```yaml
- kind: text | select | url | file | brain-pick | tone
  name: snake_case_id              # required, unique within the array
  label: "Question shown to user"   # required, ≤ 80 chars
  hint: "Optional helper text"      # optional, ≤ 200 chars
  required: true | false             # default true
  default: "..."                     # optional, string
  options: ["a", "b", "c"]           # required iff kind=select
  brain_type: decision | voice | ... # required iff kind=brain-pick
```

Kind semantics:

| `kind`       | What the user sees                                    | Value passed to body                          |
|--------------|-------------------------------------------------------|-----------------------------------------------|
| `text`       | Single-line text input                                | Raw string                                    |
| `select`     | Dropdown of `options`                                 | Selected option                               |
| `url`        | URL input, validated as `https?://`                   | URL string                                    |
| `file`       | File upload, ≤ 5 MB, text-extractable types only      | Extracted text content                        |
| `brain-pick` | Picker over the tenant's memories of `brain_type`     | The picked memory's id (use in `<cite>` tags) |
| `tone`       | Curated voice-register subset (existing tone control) | Register name (e.g. `"direct-lowercase"`)     |

Unknown `kind` → reject with `UNKNOWN_INPUT_KIND`. Missing `options` on `select` → `MISSING_SELECT_OPTIONS`. Missing `brain_type` on `brain-pick` → `MISSING_BRAIN_TYPE`.

### `retrieval` (object)

Declares what memory rows the skill needs in its context window. **Stored at import; not yet honored at inference time in v1.5** — see [ADR-0010](../memory/decisions/0010-retrieval-forward-only.md).

```yaml
retrieval:
  required_types: [decision, voice, ...]    # supertag enum subset
  contextual_types:
    top_k: 12
    types: [glossary, vendor, team]
```

`required_types` activates in v1.5.1. `contextual_types.top_k` activates in v1.6 once hybrid retrieval ships. Authors should declare both correctly today so they don't need to re-author.

Schema check at import:
- `required_types` items must be valid supertags (`voice | decision | glossary | vendor | product | team | skill | source_artifact | note`).
- `contextual_types.top_k` must be an integer in `[1, 50]`.
- Unknown supertags → `UNKNOWN_SUPERTAG`.

### `citation_contract` (string, enum)

How strictly the skill's output must cite memory. **One of:**

- `required` — every claim shaped by a memory row must carry a `<cite mem_id="..."/>` tag. Enforced by `validateRun()`; output with uncited claims fails.
- `encouraged` — citations rendered if present, but no failure on absence.
- `none` — citations stripped from output. Use for skills that don't reference memory (e.g. pure rewriting/formatting actions).

Unknown value → `UNKNOWN_CITATION_CONTRACT`.

### `output_kind` (string, enum)

What the renderer should do with the output. **One of:** `draft` · `checklist` · `structured-data` · `code`.

- `draft` — Markdown text body, rendered via the standard review surface.
- `checklist` — list of items the user accepts/rejects individually.
- `structured-data` — JSON object validated against an inline `output_schema` (see §4). If `output_schema` is missing, falls back to displaying raw JSON.
- `code` — fenced code block, language picked from a sibling `output_lang` field if present.

### `output_schema` (object, optional, required iff `output_kind=structured-data`)

A subset of JSON Schema. Used to validate the LLM's structured output before display. Supported keywords: `type`, `properties`, `required`, `items`, `enum`, `minimum`, `maximum`, `minLength`, `maxLength`. No `$ref`, no `oneOf`/`anyOf`/`allOf` in v1.5 (use enums instead).

## §4 — Optional `metadata.bbc.*` fields

Future-compat fields that BBC reads but doesn't yet act on. Setting them is non-breaking; omitting them is fine.

- `version` (string, semver) — author's version of the skill.
- `author` (string) — display name shown in the Library card foot ("by ...").
- `homepage` (URL) — link from the detail drawer.
- `tags` (array of strings) — filter chips in the Library tab.

Unknown fields under `metadata.bbc.*` are **preserved** on the parsed `BbcSkill` as `manifest.unknown`. They don't cause rejection. This is intentional — forward-compat for fields a v1.5.x or v1.6 release might add.

## §5 — Body

The body is opaque Markdown. BBC wraps it in a system prompt at run time:

```
<bbc-system>
  <skill kind="..." role="..." citation-contract="...">
    <body>{{ AUTHOR'S BODY }}</body>
  </skill>
  <brain-summary>{{ INJECTED }}</brain-summary>
  <inputs>{{ INJECTED }}</inputs>
  <tenant-overrides>{{ INJECTED }}</tenant-overrides>
  <citation-instructions>{{ INJECTED }}</citation-instructions>
</bbc-system>
```

Tag names + structure are BBC-controlled and authors cannot rely on them being stable. Author guidance:

- Treat the body as **instructions to the LLM**, not as the final output template. Use second-person imperative: "Write…", "Cite…", "Avoid…".
- Reference inputs via `{{input.name}}` interpolation. The parser strips placeholders the skill doesn't declare in `first_use_inputs`.
- Reference brain rows via plain English ("the product memory") — the host injects the typed slice. Don't try to template against specific row ids.
- If you set `citation_contract: required`, **explicitly tell the LLM in the body** to cite (the contract enforces; the body teaches).

## §6 — Validation errors

The parser returns a single typed error per failure with a stable `code`. Authors should use the code (not the message) for tooling:

| Code                       | When                                                        |
|----------------------------|-------------------------------------------------------------|
| `BODY_TOO_LARGE`           | Total file > 256 KB                                          |
| `FRONTMATTER_PARSE_ERROR`  | YAML syntax error                                            |
| `MISSING_BBC_BLOCK`        | No `metadata.bbc` object present                            |
| `MISSING_FIELD`            | Required field absent — `field` carries the path             |
| `UNKNOWN_ROLE`             | `metadata.bbc.role` outside enum                            |
| `UNKNOWN_KIND`             | `metadata.bbc.kind` outside enum                            |
| `UNKNOWN_INPUT_KIND`       | `first_use_inputs[i].kind` outside enum                     |
| `MISSING_SELECT_OPTIONS`   | `kind=select` without `options`                             |
| `MISSING_BRAIN_TYPE`       | `kind=brain-pick` without `brain_type`                      |
| `UNKNOWN_SUPERTAG`         | `retrieval.required_types[i]` or `contextual_types.types[i]` outside enum |
| `UNKNOWN_CITATION_CONTRACT`| `citation_contract` outside enum                            |
| `UNKNOWN_OUTPUT_KIND`      | `output_kind` outside enum                                  |
| `MISSING_OUTPUT_SCHEMA`    | `output_kind=structured-data` without `output_schema`       |
| `INVALID_OUTPUT_SCHEMA`    | `output_schema` uses unsupported JSON Schema keywords       |
| `DUPLICATE_INPUT_NAME`     | Two `first_use_inputs` entries share a `name`               |

Errors include the field path and a one-line human-readable hint. Example:

```
{
  "code": "MISSING_FIELD",
  "field": "metadata.bbc.first_use_inputs",
  "hint": "Add `first_use_inputs: []` if the skill needs no user input."
}
```

## §7 — Security model

### URL allowlist (for github imports)

Server-side URL imports fetch from `github.com` or `raw.githubusercontent.com` only. Redirects to off-allowlist hosts are rejected before the body is read.

### Body size cap

256 KB hard. Counts the full file including frontmatter. Larger payloads → `BODY_TOO_LARGE`.

### Prompt-injection sandbox

The author's body is treated as untrusted. The host wraps it in BBC-controlled framing (§5) and runs `scanForInjectionPatterns(body)` to flag known attack shapes (system-prompt-override, exfiltration, tool-misuse). Findings are surfaced to the importing admin pre-install; the admin must explicitly accept any flagged skill. See `apps/dashboard/test/skill-import/prompt-injection.test.ts` (AT-PI-1 through AT-PI-5) for the test floor.

### Admin gate

Server actions `installSkill()` and `uninstallSkill()` call `requireRole(actor, "admin")` before any DB write. Non-admins cannot import.

### Token storage

Imported skills do NOT receive tenant secrets or `external_accounts` access. They run with the same brain-summary slice the built-in studios use, plus the user's run-time `inputs` — nothing else.

## §8 — Examples

### Minimal valid manifest

```markdown
---
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

Rewrite the user's input in our voice. Keep it lowercase. Avoid corporate jargon
(see the voice memory in `<brain-summary>`).
```

### Full realistic manifest

```markdown
---
metadata:
  bbc:
    role: marketing
    kind: skill
    label: "Launch announcement post"
    hint: "Use when the user wants a short product-launch post for X, LinkedIn, or Threads."
    first_use_inputs:
      - kind: text
        name: launch_subject
        label: "What are you launching?"
        required: true
      - kind: select
        name: target_platform
        label: "Where will this run?"
        options: ["x", "linkedin", "threads"]
        default: "x"
      - kind: brain-pick
        name: anchor_decision
        label: "Which decision does this announcement implement?"
        brain_type: decision
        required: false
    retrieval:
      required_types: [voice, product]
      contextual_types:
        top_k: 8
        types: [glossary, decision]
    citation_contract: required
    output_kind: draft
    version: "1.0.0"
    author: "BBC core"
    tags: [launch, social]
---

# Launch announcement post

You are writing a launch post for {{input.target_platform}}.

The launch subject is: {{input.launch_subject}}.

If `input.anchor_decision` is set, treat the decision memory it points to as
the authoritative "why we did this" — cite it inline.

Constraints:
- Match the tenant's voice (from `<brain-summary>`).
- 1–3 sentences for x/threads, 1 paragraph for linkedin.
- Every claim shaped by a memory MUST carry `<cite mem_id="..."/>` (citation_contract: required).
- Avoid words the voice memory marks as forbidden.
```

## §9 — Forward-compat staircase

| Field                          | v1.5            | v1.5.1            | v1.6              |
|--------------------------------|-----------------|--------------------|--------------------|
| `retrieval.required_types`     | Stored          | Honored at infer   | Honored            |
| `retrieval.contextual_types.top_k` | Stored      | Stored             | Honored (hybrid)   |
| `output_schema` enforcement    | Best-effort     | Strict             | Strict             |
| `metadata.bbc.unknown` preservation | Yes        | Yes                | Yes                |

Authors writing to this v1.0 spec today will not need to re-author for v1.5.1 or v1.6.

## §10 — Related

- [ADR-0010](../memory/decisions/0010-retrieval-forward-only.md) — retrieval-forward-only.
- [ADR-0011](../memory/decisions/0011-skill-md-bbc-spec.md) — this spec's governance entry.
- [ADR-0006](../memory/decisions/0006-marketing-studio-architecture.md) — the `Template` interface the parser conforms imported skills to.
- `apps/dashboard/src/lib/studio/templates/types.ts` — current internal Template type.
- `apps/dashboard/src/lib/skills/skill-md-parser.ts` (W2-2) — strict validator.
- `apps/dashboard/src/lib/skills/sandbox.ts` (W2-4) — prompt-injection wrapper.
- `apps/dashboard/test/skill-import/prompt-injection.test.ts` (W2-4) — AT-PI-1..5 floor.
