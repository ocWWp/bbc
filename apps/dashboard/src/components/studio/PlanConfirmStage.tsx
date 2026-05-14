"use client";

// Shown after configuring a template, before generation. Previews INTENT and
// the company memory in scope -- NOT the accept/reject review of produced
// output, and NOT final citations. See Phase P DESIGN.md. Visual design ported
// from the Claude Design "studio.html" plan-confirm screen; it renders inside
// the studio client's stage slot, so the page chrome (PageHead, breadcrumb)
// comes from StudioPageShell rather than this component.

import type { PlanPreview } from "@/lib/studio/plan-preview";
import { roleForTemplateId } from "@/lib/studio/template-id";
import { STUDIO_PRESENTATION } from "@/lib/studio/studio-presentation";

type Props = {
  plan: PlanPreview;
  onConfirm: () => void;
  onBack: () => void;
  disabled: boolean;
};

// Per-kind presentation for candidate-memory rows. Colors map onto the
// existing --t-* supertag palette -- no new hues.
const KIND_META: Record<string, { label: string; color: string }> = {
  decision: { label: "Decision", color: "var(--t-decision)" },
  voice: { label: "Voice rule", color: "var(--t-voice)" },
  vendor: { label: "Vendor", color: "var(--t-vendor)" },
  team: { label: "Team member", color: "var(--t-team)" },
  glossary: { label: "Glossary term", color: "var(--t-glossary)" },
};

function kindMeta(kind: string) {
  return KIND_META[kind] ?? { label: kind, color: "var(--paper-muted)" };
}

// Group candidate memories by kind, preserving first-seen order.
function groupByKind(items: PlanPreview["candidateMemories"]) {
  const order: string[] = [];
  const groups: Record<string, PlanPreview["candidateMemories"]> = {};
  for (const it of items) {
    if (!groups[it.kind]) {
      groups[it.kind] = [];
      order.push(it.kind);
    }
    groups[it.kind].push(it);
  }
  return order.map((kind) => ({ kind, items: groups[kind] }));
}

export function PlanConfirmStage({ plan, onConfirm, onBack, disabled }: Props) {
  const memory = plan.candidateMemories;
  const empty = memory.length === 0;
  const groups = groupByKind(memory);

  const role = roleForTemplateId(plan.templateId);
  const pres = role
    ? STUDIO_PRESENTATION[role]
    : { label: "Studio", glyph: "BB", tint: "var(--accent)" };

  const inputEntries = Object.entries(plan.inputs).filter(([, v]) => v?.trim());

  return (
    <div className="plan-confirm">
      <div className="plan-wrap">
        {/* ─── LEFT: the plan ─── */}
        <div>
          <div className="plan-summary">
            <div className="eyebrow">
              <span className="dot" aria-hidden />
              the plan · step 2 of 4 · configure →{" "}
              <strong style={{ color: "var(--ink)" }}>plan</strong> → generate → review
            </div>
            <h2>{plan.planSummary}</h2>
          </div>

          <div className="plan-section">
            <div className="plan-section-head">
              <div className="left">
                <div className="eyebrow">
                  what this can draw on · candidate memory in scope
                </div>
                <h3>
                  {empty ? (
                    <>
                      Nothing <span className="serif">matched</span>.
                    </>
                  ) : (
                    <>
                      <span className="serif">Candidate</span> memory for this run.
                    </>
                  )}
                </h3>
              </div>
              {!empty ? (
                <div className="counter">
                  <span>
                    {memory.length} item{memory.length === 1 ? "" : "s"}
                  </span>
                  <span className="sep">·</span>
                  <span>
                    {groups.length} kind{groups.length === 1 ? "" : "s"}
                  </span>
                  <span className="sep">·</span>
                  <span>not citations yet — those come after the draft</span>
                </div>
              ) : null}
            </div>

            {empty ? (
              <div className="plan-mem-empty">
                <div className="glyph" aria-hidden>
                  ∅
                </div>
                <div>
                  <h4>No company memory matched this task.</h4>
                  <p>
                    The draft will be based only on what you typed at the previous
                    step. That&apos;s <strong>fine for a first run</strong> — once the
                    draft is in front of you, you can add memory entries (decisions,
                    vendors, voice rules) and re-run with them in scope.
                  </p>
                </div>
              </div>
            ) : (
              groups.map(({ kind, items }) => {
                const meta = kindMeta(kind);
                return (
                  <div
                    className="plan-mem-group"
                    key={kind}
                    style={{ ["--tag-color" as string]: meta.color }}
                  >
                    <div className="plan-mem-group-head">
                      <span className="dot" aria-hidden />
                      <span>
                        {meta.label.toLowerCase()}
                        {items.length === 1 ? "" : "s"}
                      </span>
                      <span style={{ color: "var(--paper-muted-2)" }}>
                        · {items.length}
                      </span>
                      <span className="rule" />
                    </div>
                    <div className="plan-mem-list">
                      {items.map((it, i) => (
                        <div
                          className="plan-mem-row"
                          key={it.id}
                          style={{ ["--tag-color" as string]: meta.color }}
                        >
                          <span className="n">{String(i + 1).padStart(2, "0")}</span>
                          <div className="body">
                            <div className="label">{it.label}</div>
                          </div>
                          <span className="kind-chip">
                            <span className="dot" aria-hidden />
                            {meta.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ─── RIGHT: rail with template + configure recap + guardrails ─── */}
        <aside className="plan-rail">
          <div className="plan-rail-block">
            <div className="h">
              <span className="ttl">template</span>
              <button type="button" className="edit" onClick={onBack} disabled={disabled}>
                change
              </button>
            </div>
            <div
              className="plan-rail-tpl"
              style={{ ["--role-color" as string]: pres.tint }}
            >
              <div className="glyph" aria-hidden>
                {pres.glyph}
              </div>
              <div>
                <div className="nm">{plan.templateLabel}</div>
                <div className="out">{pres.label} studio</div>
              </div>
            </div>
          </div>

          {inputEntries.length > 0 ? (
            <div className="plan-rail-block">
              <div className="h">
                <span className="ttl">what you typed · configure</span>
                <button
                  type="button"
                  className="edit"
                  onClick={onBack}
                  disabled={disabled}
                >
                  edit
                </button>
              </div>
              <div className="plan-rail-rows">
                {inputEntries.map(([k, v]) => (
                  <div className="row" key={k}>
                    <span className="k">{k}</span>
                    <span className="v">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="plan-rail-block">
            <div className="h">
              <span className="ttl">guardrails</span>
            </div>
            <div className="plan-rail-rows">
              <div className="row">
                <span className="k">saves to drive</span>
                <span className="v">no — review first</span>
              </div>
              <div className="row">
                <span className="k">sends anything</span>
                <span className="v">no — review first</span>
              </div>
              <div className="row">
                <span className="k">writes memory</span>
                <span className="v">no — review first</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* sticky action bar */}
      <div className="plan-actions">
        <div className="left">
          <span className="check" aria-hidden>
            <CheckIcon />
          </span>
          <span>
            review-gated ·{" "}
            {empty
              ? "no memory in scope"
              : `${memory.length} memory item${memory.length === 1 ? "" : "s"} in scope`}{" "}
            · nothing is saved or sent until you approve
          </span>
        </div>
        <div className="btns">
          <button
            type="button"
            className="btn-back-lg"
            onClick={onBack}
            disabled={disabled}
          >
            <span style={{ transform: "rotate(180deg)", display: "inline-flex" }} aria-hidden>
              <ArrowIcon />
            </span>
            Back
          </button>
          <button
            type="button"
            className="btn-primary-lg"
            onClick={onConfirm}
            disabled={disabled}
          >
            Confirm &amp; generate
            <ArrowIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="2.5" y1="7" x2="11.5" y2="7" />
      <polyline points="8,3.5 11.5,7 8,10.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 14 14"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="2.5,7.5 5.5,10.5 11.5,4" />
    </svg>
  );
}
