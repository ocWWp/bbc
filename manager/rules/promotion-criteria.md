# Rule: Promotion criteria (Distribution → Main)

When a leaf proposes that a fact discovered locally be promoted into Main-owned memory, Manager applies these checks in addition to the standard proposal review.

## Promote when…

- The fact is **org-relevant**, not leaf-specific. Test: would another leaf (current or future) plausibly need to know this?
- The fact is **observable**, not a preference. Promote "the email-delivery provider's free tier rate-limits at 100/day on shared IPs" (observable). Don't promote "I prefer Tailwind over Vanilla Extract" (preference — keep it leaf-local).
- The fact is **stable**. Test: is this likely to be true in 6 months? If it's a transient incident, write a runbook in `memory/ops/` instead and reference the incident.
- Naming the file in `memory/<category>/` makes sense. If the fact doesn't fit any current category, propose a category addition first (Manager-owned rule change).

## Reject promotion when…

- The fact only matters inside one leaf — keep it in `distribution/<leaf>/local/`.
- The fact is a duplicate or supersedes existing memory without acknowledging it (use `change_kind: supersede` and list `supersedes:` in frontmatter).
- The fact is unverified rumor. Promotion requires a `source:` field that cites the leaf's local observation, a human, or an external URL.

## Bookkeeping on accept

When `accept.sh` applies a promotion:

- The new file is written under `memory/<category>/` with `owning_layer: main`.
- The leaf's `distribution/<leaf>/local/<original>.md` is replaced with a stub:
  ```markdown
  This local note was promoted to memory/<category>/<file>.md
  Provenance: <proposal_id>
  ```
- The proposal moves to `queue/_accepted/`.

This is the chain that lets the future dashboard read everything authoritative from `memory/` alone.
