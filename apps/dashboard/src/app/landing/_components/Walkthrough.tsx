"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { DUMP_TEXT, EXTRACTED, STUDIO } from "./data";
import { Tag } from "./Tag";
import { SafeInline } from "./safe-render";
import { ArrowIcon, CheckIcon } from "./icons";

export function Walkthrough() {
  const [step, setStep] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(EXTRACTED.length);
  const [approved, setApproved] = useState<Set<number>>(
    () => new Set(EXTRACTED.map((_, i) => i).slice(0, 3)),
  );

  useEffect(() => {
    if (step !== 1) return;
    setVisibleCount(0);
    setExtracting(true);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setVisibleCount(i);
      if (i >= EXTRACTED.length) {
        clearInterval(id);
        setExtracting(false);
      }
    }, 240);
    return () => clearInterval(id);
  }, [step]);

  const toggle = (i: number) => {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const steps = [
    {
      n: "01",
      title: "paste a brain-dump",
      desc:
        "slack export, founders' notes, a PRD, a meeting transcript. anything. bbc keeps the raw artifact as a typed memory of its own.",
    },
    {
      n: "02",
      title: "review the typed extractions",
      desc:
        "claude pulls 15-30 typed memory candidates. you approve, edit, or reject each one. nothing commits without a human.",
    },
    {
      n: "03",
      title: "compose in the studio (or query from an agent)",
      desc:
        "the marketing studio drafts posts in your voice, citing the memories that shaped them. or wire it to claude / gpt via MCP and let agents query by type.",
    },
  ];

  const mutedMonoStyle: CSSProperties = {
    fontFamily: "var(--font-geist-mono), monospace",
    fontSize: 12,
    color: "var(--muted)",
  };

  return (
    <section className="section" id="how">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow"><span className="num">02</span><span>how it works</span></div>
            <h2 className="section-title">
              three steps. <span className="serif">no magic.</span>
            </h2>
          </div>
          <p className="section-blurb">
            the entire path from &quot;a slack thread happened&quot; to &quot;an agent answers correctly&quot; is three deterministic steps. click through them.
          </p>
        </div>

        <div className="walk">
          <div className="walk-steps">
            {steps.map((s, i) => (
              <div
                key={i}
                className={`walk-step ${step === i ? "is-active" : ""}`}
                onClick={() => setStep(i)}
              >
                <div className="n">{s.n}</div>
                <div>
                  <div className="title">{s.title}</div>
                  <div className="desc">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="walk-stage">
            <div className="walk-stage-head">
              <div className="dots"><span /><span /><span /></div>
              <span style={{ marginLeft: 4 }}>
                {step === 0 && "bbc/dumps/planning-call.md"}
                {step === 1 &&
                  `bbc extract --from planning-call.md  ${extracting ? "· extracting…" : `· ${visibleCount} candidates`}`}
                {step === 2 && "bbc studio · announce BBC's launch"}
              </span>
              <div style={{ marginLeft: "auto" }} className="mono">{step + 1} / 3</div>
            </div>

            <div className="walk-stage-body">
              {step === 0 && (
                <div>
                  <div className="brain-dump">{DUMP_TEXT}</div>
                  <div className="dump-meta">
                    <span>{DUMP_TEXT.length} chars · {DUMP_TEXT.split(/\s+/).length} words</span>
                    <span>type: source_artifact</span>
                  </div>
                  <div className="extract-btn">
                    <button className="btn btn-primary" onClick={() => setStep(1)}>
                      extract typed memories <ArrowIcon />
                    </button>
                    <span className="kbd">⌘↵</span>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: 14,
                      ...mutedMonoStyle,
                    }}
                  >
                    <span>{extracting ? "extracting…" : "review and approve each candidate."}</span>
                    <span>{approved.size}/{EXTRACTED.length} approved</span>
                  </div>
                  <div className="memory-grid">
                    {EXTRACTED.slice(0, visibleCount).map((m, i) => (
                      <div
                        key={i}
                        className={`memory-card ${approved.has(i) ? "is-approved" : ""}`}
                        style={{ animation: "mem-in 0.32s cubic-bezier(.2,.7,.2,1) both" }}
                      >
                        <div className="top">
                          <Tag name={m.tag} />
                          <div className="check" onClick={() => toggle(i)}>
                            <span className="box">{approved.has(i) && <CheckIcon />}</span>
                            <span
                              style={{
                                fontFamily: "var(--font-geist-mono), monospace",
                                fontSize: 11,
                                color: "var(--muted)",
                              }}
                            >
                              approve
                            </span>
                          </div>
                        </div>
                        <div className="body"><SafeInline html={m.body} /></div>
                        <div className="foot">
                          <span>from: {m.source}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {!extracting && (
                    <div className="extract-btn">
                      <button
                        className="btn btn-primary"
                        onClick={() => setStep(2)}
                        disabled={approved.size === 0}
                      >
                        commit {approved.size} memor{approved.size === 1 ? "y" : "ies"} <ArrowIcon />
                      </button>
                      <span className="kbd">⌘↵</span>
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="studio">
                  <div className="studio-prompt">
                    <span className="caret" />
                    <span>announce BBC&apos;s launch</span>
                  </div>
                  <div style={mutedMonoStyle}>
                    studio composed 3 drafts using{" "}
                    <strong style={{ color: "var(--ink)" }}>{approved.size}</strong> memories · each cited inline.
                  </div>
                  <div className="studio-outputs">
                    {STUDIO.map((s, i) => (
                      <div key={i} className="studio-card">
                        <div className="channel">
                          <span className="icon">{s.icon}</span>
                          <span>{s.channel}</span>
                        </div>
                        <div className="text" style={{ whiteSpace: "pre-line" }}>{s.text}</div>
                        <div className="cites">
                          {s.cites.map((c, j) => (
                            <span key={j} className="cite">↳ {c}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="extract-btn">
                    <button className="btn btn-ghost" onClick={() => setStep(0)}>start over</button>
                    <span style={mutedMonoStyle}>
                      or wire an agent to query the same memories via MCP →
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes mem-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}
