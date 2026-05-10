---
name: bbc:invoke
description: Resolve a skill for the current caller and surface its effective body
allowed-tools:
  - Read
  - Bash
---

<objective>
Given a skill short-id (e.g., `pr-review`), resolve the most-specific specialization for the current caller's layer and print the effective skill — the merged body that the agent should follow.

Use this when an agent should "do an X" and you want the right specialization auto-selected (polymorphism in F2 terms).
</objective>

<process>
1. Detect layer:
   ```bash
   layer=$(bash bbc/scripts/which-layer.sh)
   ```
   Map to caller tier:
   - `leaf:<name>` → caller is `<name>` (e.g., `web`)
   - `manager` or `main` → caller is `general`
   - `unknown` → refuse.

2. Get the skill short-id from the user (e.g., `pr-review`).

3. Run resolver:
   ```bash
   bash bbc/scripts/resolve-skills.sh <short-id> --caller <caller>
   ```

4. The resolver prints the effective skill body + resolution_trace. Surface both to the user.

5. If the caller is going to ACT on the skill (not just inspect), parse the resolved body's rules + voice and apply them in subsequent operations. The runbook lives in the resolved body's "Body" section.

Do NOT modify any skill file. /bbc:invoke is read-only.
</process>

<refusal_examples>
- "Cannot resolve skill from `unknown` layer. cd to a leaf, manager, or BBC root."
- "Skill `<short>` does not resolve from caller `<caller>`. Run /bbc:skill-trace to see the search path."
</refusal_examples>
