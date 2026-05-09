---
name: bbc:propose
description: File a proposal to change a Main- or Manager-owned memory file
allowed-tools:
  - Bash
  - Read
  - Write
---

<objective>
Guide the user (or yourself, when invoked autonomously) through filing a well-formed proposal in `bbc/queue/`. Wraps `bbc/scripts/propose.sh` with prompting, layer-detection, and diff-body construction.

Use this when the user wants to change a Main- or Manager-owned file (anything under `memory/`, `manager/CLAUDE.md`, `manager/rules/`). Direct edits to such files are not allowed from leaves; this command is the path.
</objective>

<process>
1. Detect layer:
   ```bash
   layer=$(bash bbc/scripts/which-layer.sh)
   ```

   Refuse with a clear message if `layer` is `main` (Main edits its own files directly), `unknown` (run from inside a leaf or `manager/`), or matches `_template`.

   Allowed callers: `manager` and `leaf:*`.

2. Gather inputs (ask the user if any are missing, or infer when obvious from conversation context):

   - `--target` — `main` or `manager`. Determine from what file the user wants to change: anything under `memory/` or `bbc/CLAUDE.md` → `main`. Anything under `manager/` → `manager`.
   - `--file` — relative path from the BBC repo root.
   - `--kind` — `edit`, `add`, or `supersede`. Default to `edit` if changing an existing file.
   - `--summary` — short single line describing the change.
   - `--source` — REQUIRED. If the user doesn't supply one explicitly, ask. Acceptable forms: `"human directive: <who said it, when>"`, `"leaf observation: <what was observed>"`, `"external: <url>"`. Do NOT proceed with the weak default.

3. Build the diff body. For `--kind edit`:
   - Read the target file to get its current contents.
   - Construct a unified diff that adds/changes/removes only the lines the user wants. Match the target's existing whitespace and indentation exactly.
   - Write the diff to `/tmp/bbc-propose-<timestamp>.md` inside a fenced ```diff block.

   For `--kind add`:
   - Construct the full new file body (frontmatter + content) in `/tmp/bbc-propose-<timestamp>.md` inside a fenced ```markdown block.

   For `--kind supersede`:
   - Cite the file being superseded by id and explain why.

4. Run propose.sh from the directory whose name lets `--originator` infer correctly. Path depth depends on layer:

   **From a leaf (`bbc/distribution/<leaf>/`):**
   ```bash
   cd bbc/distribution/<leaf> && \
     bash ../../scripts/propose.sh \
       --target <target> --file <file> --kind <kind> \
       --summary "<summary>" --source "<source>" \
       --body-file /tmp/bbc-propose-<timestamp>.md
   ```

   **From manager (`bbc/manager/`):**
   ```bash
   cd bbc/manager && \
     bash ../scripts/propose.sh \
       --target <target> --file <file> --kind <kind> \
       --summary "<summary>" --source "<source>" \
       --body-file /tmp/bbc-propose-<timestamp>.md
   ```

   Note the depth difference: leaves are two levels deep (`../../scripts/`), manager is one level deep (`../scripts/`). If you call from elsewhere, pass `--originator leaf-<name>` or `--originator manager` explicitly.

5. Report:
   - The proposal_id (verbatim from script output).
   - The path to the queue file.
   - Whether `--source` was explicit or warning-defaulted.
   - The next step: "/bbc:review (manager session) → /bbc:accept (main session)".

Do NOT edit the target file directly. Do NOT mark the proposal accepted. Do NOT run accept.sh.
</process>

<refusal_examples>
- "Run this from inside a leaf or manager session. From Main, edit the file directly."
- "Cannot infer your layer. cd into bbc/distribution/<leaf>/ or bbc/manager/ first."
- "I need an explicit --source citation. The weak default ('observation, no source cited') will trigger Manager to request changes anyway."
</refusal_examples>
