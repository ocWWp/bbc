# F1 — Tool Credibility Ranker (DESIGN)

## Context

The original BBC pitch said "BBC searches up the most credible skills and tools for the relative users." That sentence is one phrase covering at least three distinct, well-studied problems:

1. **Registry** — what tools exist that satisfy a given role, and what do we know about each? (F4 already designed this layer.)
2. **Recommender** — given multiple candidates and a context (which brand, which leaf, what task), pick one. This is preference-over-candidates.
3. **Trust scoring** — how confident are we in each candidate's quality, and where does that confidence come from?

When all three are merged into a single LLM prompt ("pick the best tool"), the system feels like magic and is impossible to debug. F1 separates them. Each layer has named inputs, named outputs, and inspectable failure modes.

The goal of F1 is **decomposable picking**: when someone asks "why did BBC pick X for role R in context P?", the answer is a formula with traceable terms, not a vibe.

---

## 1. Layered architecture

```
                        F4: Role contracts
                              │
                              ▼
                        F4: Adapter declarations  ─────►  candidates(role)
                              │
                              ▼
              ┌───────────────────────────────────┐
              │  F1.A — Brand / Context profiles  │
              │  (who's asking, with what limits) │
              └───────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────────┐
              │  F1.B — Hard-constraint filter    │
              │  (drop candidates that violate    │
              │   any non-negotiable)             │
              └───────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────────┐
              │  F1.C — Trust scoring             │
              │  (compute trust(adapter, role))   │
              └───────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────────┐
              │  F1.D — Ranker                    │
              │  (weighted score over surviving   │
              │   candidates; pick top-1)         │
              └───────────────────────────────────┘
                              │
                              ▼
                        binding update proposal
                        (queued via accept.sh)
```

Each layer is independently inspectable. A failure to pick a sensible adapter has exactly one cause at one layer.

---

## 2. F1.A — Brand / Context profiles

A *profile* encodes what the requester needs. Profiles are explicit; the ranker doesn't infer them. One profile per (org, brand, leaf, task-class) combination, stored in `memory/ops/profiles/<profile-id>.yaml`. Owning layer: `main` for org-wide profiles, `manager` for brand-specific.

```yaml
# memory/ops/profiles/marketing-default.yaml
---
id: profile_marketing-default
profile_id: marketing-default
type: ranker-profile
scope: product:8azi
applies_to:
  leaves: [8azi-market]
  task_classes: [image-edit, video-gen, social-publish]
contract_version: 1
status: accepted
---

# Profile: marketing-default

## Hard constraints (any violation excludes the candidate)
- max_cost_per_call_usd: 0.05
- min_content_filter: required-and-public
- data_residency_in: [us, eu]
- max_latency_p95_ms: 15000
- banned_providers: []     # explicit ban list (org policy)

## Soft preferences (bias terms, not exclusions)
- preferred_providers: []  # bias toward these
- region_preference: us-east-1
- vibe_descriptors: ["warm", "mystical", "non-corporate"]

## Ranker weights (must sum to 1.0)
weights:
  cost: 0.25
  latency: 0.15
  trust: 0.35
  outcome_history: 0.15
  preference_match: 0.10

## Outcome attribution window
outcome_window_days: 30
```

**Key design decisions:**

- **Hard constraints exclude; soft preferences bias.** A vendor that violates a hard constraint cannot win regardless of any other score. A vendor that doesn't match a soft preference can still win if other factors compensate.
- **Weights sum to 1.0** — enforced at proposal-review time so weights remain comparable across profiles.
- **Profiles are versioned and queue-mediated** like any other Main-owned memory. Changing a weight from 0.3 to 0.5 is a proposal with provenance, not a silent edit.

---

## 3. F1.B — Hard-constraint filter

Pure boolean evaluation. Pseudocode:

```
candidates_filtered(role, profile):
  surviving = []
  for adapter in F4.candidates(role):
    if any(profile.hard_constraints) violated by adapter.metadata:
      skip
    if adapter.provider_id in profile.banned_providers:
      skip
    if adapter.contract_version != role.contract_version:
      skip
    surviving.append(adapter)
  return surviving
```

**Hard constraints come from three sources, in priority order:**

1. **Role hard rules** (F4 role YAML's `Hard rules` section).
2. **Profile hard constraints** (this profile's YAML).
3. **Org policy hard constraints** (a global `memory/ops/profiles/_org-policy.yaml` that every profile inherits — e.g., banned vendors org-wide).

Any violation at any tier excludes. Excluded candidates are reported (not silently dropped) so reviewers see why a popular adapter wasn't picked.

---

## 4. F1.C — Trust scoring

Trust is **multi-source, weighted, and decomposable**. For each adapter:

```
trust(adapter, role) =
    α × stability_signal(adapter)
  + β × outcome_signal(adapter, role, window)
  + γ × external_signal(adapter)
  + δ × declared_signal(adapter)
```

with `α + β + γ + δ = 1.0` and:

| Signal | Source | What it measures | Notes |
|---|---|---|---|
| `stability_signal` | adapter YAML `stability:` block (uptime %, incident count last 90d) | Has the vendor been reliable historically? | Drawn from public statuspage + manual logging. Updated weekly via Manager sweep. |
| `outcome_signal` | log of (success_rate × log(usage_count)) over `profile.outcome_window_days` | Does this adapter actually work for *us*? | Slowest to accumulate. Cold-start is biggest problem (see §6). |
| `external_signal` | adapter YAML `external:` (review aggregates, GitHub stars, public benchmarks) | What does the wider market say? | Most gameable. Lowest weight by default. |
| `declared_signal` | adapter YAML `declared:` block (vendor's own SLAs, claimed metrics) | What did the vendor promise? | Useful only as a sanity check against measured signals. |

**Default weights (org policy, override per profile):**
```
α = 0.35  (stability)
β = 0.40  (outcome — highest, but only when window has data)
γ = 0.10  (external — lowest, gameable)
δ = 0.15  (declared — sanity check)
```

When `outcome_signal` has insufficient data (cold start), its weight redistributes to stability and declared. This is the cold-start fallback — explicitly a fallback, not a hidden assumption.

---

## 5. F1.D — Ranker (the actual scoring formula)

For each surviving candidate after F1.B:

```
score(adapter, role, profile) =
    profile.weights.cost            × normalize_cost(adapter, profile)
  + profile.weights.latency         × normalize_latency(adapter, profile)
  + profile.weights.trust           × trust(adapter, role)
  + profile.weights.outcome_history × outcome_history(adapter, role, profile.outcome_window_days)
  + profile.weights.preference_match × preference_match(adapter, profile)
```

with normalization:

```
normalize_cost(a, p)  = max(0, 1 - a.cost_per_call_usd / p.max_cost_per_call_usd)
normalize_latency(a, p) = max(0, 1 - a.latency_p95_ms / p.max_latency_p95_ms)
preference_match(a, p) = 1.0 if a.provider_id in p.preferred_providers else 0.0
```

`outcome_history` is `min(1, log(1 + n_successful_calls) / log(1 + n_total_calls))` over the profile window — bounded in [0, 1].

The picked adapter is `argmax(score)` with ties broken by `provider_id` lexicographically (deterministic).

**Inspectability:** every pick produces a full trace:

```yaml
pick_trace:
  role: image-edit-provider
  profile: marketing-default
  picked: higgsfield-v2
  excluded:
    - { provider: flux-pro,    reason: "violates max_cost_per_call_usd (0.08 > 0.05)" }
  ranked:
    - { provider: higgsfield-v2, score: 0.74, terms: { cost: 0.6, latency: 0.7, trust: 0.85, outcome: 0.5, preference: 0 } }
    - { provider: runway-edit,   score: 0.61, terms: { cost: 0.7, latency: 0.5, trust: 0.65, outcome: 0.4, preference: 0 } }
  decided_at: 2026-05-08T12:00:00Z
  decided_by: ranker-v1
```

The trace is appended to the binding update proposal so the audit trail records WHY this binding was picked, not just THAT it was.

---

## 6. F1.E — Learning loop

Outcomes feed back into `outcome_signal`. Each call to a bound adapter is logged:

```yaml
# memory/ops/outcomes/<adapter>/<YYYY-MM>.jsonl  (one line per call)
{ ts: ..., adapter: higgsfield-v2, role: image-edit-provider, profile: marketing-default,
  task_id: ..., success: true, latency_ms: 7200, cost_usd: 0.018,
  follow_up_signals: { user_kept_output: true, regenerated_count: 0 } }
```

Periodic (e.g., weekly Manager sweep) aggregation:

1. Roll up per-adapter outcomes from the last `outcome_window_days`.
2. Recompute `outcome_signal(adapter, role)`.
3. Re-run the ranker against current bindings.
4. If a different adapter would now win for any role, file a `binding-update` proposal (with the new pick_trace as evidence).
5. Manager reviews; Main accepts. Binding flips. Quarantine of the previous adapter starts (per F4).

This is deliberately **slow** (manual review + accept) for V1. Auto-accept of binding updates is a future high-trust extension; explicitly out of scope.

---

## 7. What F1 explicitly does NOT solve

These are real, hard problems. F1 does not pretend to.

1. **Cold start.** When a brand-new role appears with zero historical outcomes, `outcome_signal` is 0 for every candidate. The ranker falls back on `stability + declared + external`, which are noisy. **Mitigation:** humans manually pick the first binding; the ranker takes over after the outcome window fills. This is documented as a hard rule in `manager/rules/cold-start-policy.md` (future).
2. **Outcome attribution.** "Did the marketing engagement spike because we switched to Higgsfield, or because it was Black Friday?" F1 records correlations, not causations. The `outcome_signal` is honest about being correlational. **No fix.** Run controlled experiments (future F1.X) if you need causal answers.
3. **Gamed external signals.** A vendor inflating its GitHub stars or paying for top-of-list reviews biases `external_signal`. **Mitigation:** keep `γ` (external weight) low (default 0.10) and audit external signal sources in `manager/rules/external-signal-sources.md` (future). Some gaming will still get through.
4. **Profile drift.** When does `marketing-default` need its weights updated? F1 has no detector. **Mitigation:** every binding update proposal forces Manager to look at the `pick_trace`; if the trace looks wrong (e.g., a high-latency adapter winning because cost weight is too high), Manager files a counter-proposal updating the profile weights. This is human-in-the-loop, intentional for V1.
5. **Multi-region / multi-tenancy.** One profile per (brand, leaf, task-class) gets unwieldy when you have 50 brands. **Mitigation:** profile inheritance (a future F1.X — `extends:` field, similar to F2's skill inheritance). Defer.
6. **Explainability beyond pick_trace.** The trace shows what numbers led to the pick. It doesn't show *why* `trust = 0.85` — that requires drilling into the four trust signals individually. Achievable via the same decomposition, just one level deeper. Out of scope for V1.

---

## 8. The reframe (honest)

This is not one problem. It is three stacked, well-studied problems:

| Layer | Field name | Standard pitfalls |
|---|---|---|
| F1.A + F1.B | Constraint satisfaction | Hard vs. soft constraint confusion; profiles as silent overrides; weight summation drift |
| F1.D | Multi-criteria decision analysis | Score normalization; argmax instability under tied scores; reviewer disagreement when weights are opaque |
| F1.C + F1.E | Trust scoring + bandit-style outcome learning | Cold start; survivorship bias (you only see outcomes for the bound adapter); gameable external signals |

The "magic" appearance comes from solving all three implicitly inside an LLM prompt. F1 separates them so each can be evaluated, debugged, and improved independently. None is solved completely. Each is **better** than the implicit-LLM version.

---

## 9. Files this phase WILL produce when implemented

```
memory/ops/profiles/
├── _org-policy.yaml                       # global hard constraints
├── marketing-default.yaml
├── engineering-default.yaml
└── ... (per brand / leaf / task-class)

memory/ops/outcomes/
├── higgsfield-v2/
│   ├── 2026-05.jsonl
│   └── ...
└── ...

manager/rules/
├── cold-start-policy.md
├── external-signal-sources.md
└── outcome-attribution-honesty.md

scripts/
├── rank.sh                                # one-shot: rank candidates for (role, profile)
├── outcome-aggregate.sh                   # weekly rollup → trust signal updates
└── binding-update.sh                      # generates a binding-update proposal with pick_trace

.claude/commands/bbc/
├── rank.md                                # /bbc:rank <role> [--profile <id>]
└── outcome-log.md                         # /bbc:outcome-log <adapter> <success|fail> [...]
```

---

## 10. Build phases (each its own future plan)

- **F1-build-1:** profiles directory + schema validator + `_org-policy.yaml` authored from current `vendors.md`. No ranker code yet.
- **F1-build-2:** ranker formula implemented as `scripts/rank.sh` (pure function: in = role+profile, out = pick_trace). Unit-tested against fixture profiles + adapters.
- **F1-build-3:** outcome logging + weekly rollup. Manual `/bbc:outcome-log` initially; automatic emission from leaves later.
- **F1-build-4:** integration with F4's binding-update flow. Ranker produces pick_trace; pick_trace becomes proposal evidence; humans still accept.

Each is gated behind the previous + a subagent walkthrough.

---

## 11. Acceptance for this DESIGN phase

- This PLAN.md exists.
- Three honest scope boundaries (F1.A vs F1.C vs F1.E) are documented.
- The ranker formula is in §5 with named, normalizable terms.
- §7 lists what isn't solved.
- Roadmap and STATE reflect F1 as designed (not implemented).
