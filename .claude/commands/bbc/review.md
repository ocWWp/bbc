---
name: bbc:review
description: Manager triages pending queue items (spawns queue-reviewer sub-agent)
allowed-tools:
  - Bash
  - Read
  - Task
---

<objective>
Triage every pending proposal in `bbc/queue/` against the Manager rules and append a `manager_review:` block to each one's frontmatter. For cross-leaf-impacting and promotion proposals, also append the relevant `cross_leaf_impact:` / `promotion_check:` blocks.

This command is the Manager's main daily action.
</objective>

<process>
1. Detect layer:
   ```bash
   layer=$(bash bbc/scripts/which-layer.sh)
   ```
   Refuse unless `layer == manager`. Provide a clear message: "/bbc:review only runs from the Manager layer. cd into bbc/manager/ and try again."

2. List pending proposals:
   ```bash
   ls bbc/queue/*.md 2>/dev/null | grep -v 'README.md'
   ```

   For each, check whether it already has a `manager_review:` block. Skip the ones that do.

3. If no truly-pending proposals remain, print "Queue clean — nothing to review." and exit.

4. Spawn a sub-agent for the review work. Use the **Task** tool with `subagent_type: general-purpose`. Brief the sub-agent with:
   - Its working directory: `bbc/manager/`.
   - Its mandate: read `manager/CLAUDE.md`, then `manager/rules/proposal-review.md`, `cross-leaf-sync.md`, `promotion-criteria.md`, then for each pending proposal in `bbc/queue/`, apply those rules and append the relevant block(s) inside the proposal's frontmatter.
   - Its output: a one-line summary per proposal (id, verdict, any cross-leaf flags).
   - Hard constraints: no archiving (don't move files), no editing of target files, no edits to upper-layer files.

   Use the existing sub-agent definition `bbc/manager/agents/queue-reviewer.md` as the source of truth — quote its body in the brief.

5. After the sub-agent returns, print:
   - Each reviewed proposal_id with its verdict.
   - Which now have `verdict: approved` and are ready for /bbc:accept.
   - Which have `verdict: changes_requested` (still in queue, awaiting proposer revision).
   - Which have `verdict: rejected` (need a human to run reject.sh).

Do NOT accept or reject anything. Do NOT modify target files. Annotation only.
</process>

<verification>
After running, every previously-pending proposal in `bbc/queue/` should have a `manager_review:` block in its frontmatter. Files where the rules call for it should also have `cross_leaf_impact:` and/or `promotion_check:` blocks.
</verification>
