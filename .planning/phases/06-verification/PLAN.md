# Phase 06 — Verification

## Goal

Prove the BBC V1 skeleton works end-to-end across separate sessions, with audit trail.

## The 5-step walkthrough

Run all five steps in clean Claude sessions. No manual fixup allowed — if a step doesn't work, that's a defect.

### Pre-step: clean state

From a Claude or human shell:

```bash
cd /Users/grid/Documents/GitHub/bbc
ls queue/                        # should show only README.md, _accepted/, _rejected/
ls queue/_accepted/              # may have prior runs — that's fine
bash scripts/index-memory.sh     # regenerate index
```

### Step 1 — Leaf bootstrap reads upper layers

```bash
cd /Users/grid/Documents/GitHub/bbc/distribution/8azi-web-stub
```

Start a fresh Claude session here. Ask:

> What are the top three principles of this org and which file did they come from?

**Expected:** Claude cites at least three of: memory is the contract, owning_layer scoping, append-only audit trail, vendor neutrality, voice single-source, no silent autonomy. It cites `bbc/CLAUDE.md` for principles and `bbc/manager/CLAUDE.md` for the review protocol. The bootstrap header in `distribution/8azi-web-stub/CLAUDE.md` is what it reads first.

**Pass:** Claude correctly identifies the three layers, the precedence rule, and the source files.
**Fail:** If Claude cites generic principles or makes them up, the bootstrap header isn't being read — re-run `bootstrap-leaf.sh` and check the BEGIN/END markers.

### Step 2 — Leaf proposes a rule change

In the same session:

> Propose a new rule: "No emojis in marketing copy across all 8azi products."

**Expected:** Claude runs (or asks you to run):

```bash
bash ../../scripts/propose.sh \
  --target main \
  --file memory/design/voice-tone.md \
  --kind edit \
  --summary "no emoji in marketing copy" \
  --body-file <path-with-diff>
```

A new file appears under `bbc/queue/` with filename pattern `<ISO-timestamp>__leaf-8azi-web-stub__<slug>.md` and `proposal_id: prop_<timestamp>_leaf-8azi-web-stub_<slug>` in frontmatter.

**Pass:** Proposal file exists, frontmatter has all required fields (`proposal_id`, `proposed_by: leaf:8azi-web-stub`, `target_layer: main`, `target_file`, `change_kind: edit`, `status: pending`). Body is a unified diff inside a `\`\`\`diff` block.
**Fail:** Missing fields → fix `propose.sh`. Wrong filename → check timestamp generation.

### Step 3 — Manager reviews queue

```bash
cd /Users/grid/Documents/GitHub/bbc/manager
```

Start a fresh Claude session as Manager. Ask:

> Review pending queue items.

**Expected:** Claude reads `../queue/`, summarizes the proposal from step 2, applies `manager/rules/proposal-review.md`, and appends a `manager_review:` block to the proposal file:

```yaml
manager_review:
  reviewer: manager
  reviewed_at: <ISO-8601>
  verdict: approved
  notes: "<short rationale>"
```

**Pass:** Block appears inside the proposal's frontmatter (between the leading and trailing `---`).
**Fail:** If Claude tries to move the file or apply the diff itself, re-read `manager/CLAUDE.md` — Manager only annotates.

### Step 4 — Human accepts the proposal

```bash
cd /Users/grid/Documents/GitHub/bbc
bash scripts/accept.sh <proposal_id>
```

**Expected:**
- Diff applies to `memory/design/voice-tone.md` (the new rule line appears).
- Target frontmatter gains `updated: <now>` and `provenance: [<proposal_id>]`.
- Proposal file moves to `queue/_accepted/`.
- `memory/_index.md` regenerates.
- Script prints `Accepted <proposal_id>` and the archive path.

**Pass:** All four side-effects happen.
**Fail (verdict missing):** Manager step didn't append the review block — go back to step 3. To unblock for testing, `accept.sh --force` works but should not be the normal path.

### Step 5 — Fresh leaf session sees the change

Restart Claude in `distribution/8azi-web-stub` (close the old session). Ask:

> What's the rule on emojis?

**Expected:** Claude reads `memory/design/voice-tone.md` (via the leaf's reading chain: Main → Manager → leaf → cited memory) and cites the new line, including the `provenance:` proposal id.

**Pass:** Correct rule + provenance citation.
**Fail:** If Claude cites old content, the file may not have been re-read — verify `cat memory/design/voice-tone.md` shows the new line first.

## Acceptance

V1 is complete when all five steps pass without manual fixup, in clean sessions, on a freshly cloned repo.

## Re-running cleanly

To reset between test runs:

```bash
# Move test proposals out of _accepted/ if you want a clean ledger
# (keep them — audit trail is the whole point — only do this for repeated dev tests)
mkdir -p .test-archive
mv queue/_accepted/*.md .test-archive/ 2>/dev/null || true

# Revert voice-tone if a test edit is in it
git checkout -- memory/design/voice-tone.md  # if BBC is git-tracked
```

In V1 BBC is not yet git-tracked (decision deferred to a future phase). For now, dev tests should use a separate test-only memory file rather than mutating the real seeds.
