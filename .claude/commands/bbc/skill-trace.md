---
name: bbc:skill-trace
description: Show the resolution chain for a (caller, skill_id) pair without invoking
allowed-tools:
  - Read
  - Bash
---

<objective>
Diagnostic: show which skill specializations the resolver would walk for a given caller, what the effective skill_id is, and which fields each link in the chain contributes.

Use when debugging "wrong reviewer was used" or "didn't get the brand voice I expected" complaints.
</objective>

<process>
1. Get short_id (e.g., `pr-review`) and optional caller (default: current layer).

2. Run:
   ```bash
   bash bbc/scripts/resolve-skills.sh <short-id> --caller <caller>
   ```

3. Extract just the resolution_trace block from the output and print it. Skip the body.

4. Tell user: "To see the full effective skill body, run `/bbc:invoke <short-id>`."
</process>

<example_output>
```
resolution_trace:
  requested: pr-review
  caller: web
  chain:
    - { skill_id: skill, path: memory/skills/_abstract/skill.yaml }
    - { skill_id: review-skill, path: memory/skills/_abstract/review-skill.yaml }
    - { skill_id: general.pr-review, path: memory/skills/general/pr-review.yaml }
    - { skill_id: web.pr-review, path: memory/skills/web/pr-review.yaml }
  effective_skill_id: web.pr-review
```
</example_output>
