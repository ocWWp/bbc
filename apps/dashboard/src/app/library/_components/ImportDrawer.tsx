"use client";

import { useEffect, useState, type CSSProperties, Fragment } from "react";
import { IMPORT_FLAGGED_BODY } from "../_data";
import { Icons } from "./Icons";

type Stage = "idle" | "fetching" | "parsing" | "registering" | "done" | "flagged" | "error";

const STEPS = [
  { key: "fetch", lbl: "Fetching SKILL.md", meta: "GET /raw/…" },
  { key: "parse", lbl: "Parsing frontmatter + body", meta: "yaml + md" },
  { key: "scan", lbl: "Scanning body for prompt-injection patterns", meta: "regex + heuristics" },
  { key: "register", lbl: "Registering skill in /library/skills", meta: "→ workspace" },
] as const;

function statusFor(stage: Stage, idx: number): "idle" | "run" | "done" | "err" {
  if (stage === "idle") return "idle";
  if (stage === "fetching") return idx === 0 ? "run" : "idle";
  if (stage === "parsing") return idx < 1 ? "done" : idx === 1 ? "run" : "idle";
  if (stage === "flagged") return idx < 2 ? "done" : idx === 2 ? "err" : "idle";
  if (stage === "registering") return idx < 3 ? "done" : idx === 3 ? "run" : "idle";
  if (stage === "done") return "done";
  return "idle";
}

export type ImportDrawerProps = {
  flaggedDefault?: boolean;
  onClose: () => void;
};

export function ImportDrawer({ flaggedDefault, onClose }: ImportDrawerProps) {
  const [url, setUrl] = useState("github.com/swyx/agentskills/blob/main/pricing-page.md");
  const [stage, setStage] = useState<Stage>(flaggedDefault ? "flagged" : "idle");
  const [ack, setAck] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function runFetch() {
    setStage("fetching");
    setTimeout(() => setStage("parsing"), 600);
    setTimeout(() => setStage("flagged"), 1300);
  }

  function runInstall() {
    setStage("registering");
    setTimeout(() => setStage("done"), 700);
  }

  // Highlight the injected span in the preview body
  const bodyParts = IMPORT_FLAGGED_BODY.split(/(IGNORE PREVIOUS INSTRUCTIONS[\s\S]*?paragraph of the pricing page\.)/);

  const canInstall =
    stage === "flagged"
      ? ack
      : stage === "parsing" || stage === "registering" || stage === "done";

  const inlineCode: CSSProperties = {
    background: "var(--bg-2)",
    border: "1px solid var(--rule)",
    padding: "1px 5px",
    borderRadius: 4,
    fontFamily: "Geist Mono",
    fontSize: "0.86em",
  };

  return (
    <>
      <div className="lib-drawer-scrim" onClick={onClose} />
      <aside className="lib-drawer" role="dialog" aria-label="Import a skill from URL">
        <div className="lib-drawer-head">
          <div className="crumb">
            library / skills / <strong>import from URL</strong>
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="Close">
            <Icons.x />
          </button>
        </div>

        <div className="lib-drawer-body">
          <h2
            style={{
              fontFamily: "Geist",
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              margin: "0 0 6px",
            }}
          >
            Import a skill <span className="serif">from URL</span>.
          </h2>
          <p className="lede">
            Paste a GitHub URL pointing at a <code style={inlineCode}>SKILL.md</code> file or a directory of them. BBC
            fetches the body, parses the frontmatter, scans for prompt-injection patterns, then registers the skill in
            your workspace.
          </p>

          <div className="lib-import-stage">
            <div className="lib-import-input">
              <div className="url-box">
                <span className="scheme">https://</span>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="github.com/owner/repo/path/to/SKILL.md"
                  aria-label="Skill URL"
                />
              </div>
              <button type="button" className="btn btn-primary btn-lg" onClick={runFetch}>
                fetch
              </button>
            </div>

            {stage !== "idle" && (
              <div className="lib-import-progress">
                {STEPS.map((s, i) => {
                  const st = statusFor(stage, i);
                  return (
                    <div key={s.key} className={`step ${st}`}>
                      <span className="n">
                        {st === "done" ? (
                          <Icons.check />
                        ) : st === "err" ? (
                          <Icons.warn />
                        ) : st === "run" ? (
                          <span className="lib-spinner" />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <span className="lbl">{s.lbl}</span>
                      <span className="meta">{s.meta}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {stage === "flagged" && (
              <div className="lib-import-flag">
                <div className="glyph">!</div>
                <div>
                  <div className="ttl">Import flagged for review</div>
                  <div className="body">
                    The body contains a span that matches a known prompt-injection pattern (
                    <code style={{ fontFamily: "Geist Mono", fontSize: "0.92em" }}>IGNORE PREVIOUS INSTRUCTIONS</code>).
                    It may be benign — instructional snippets often contain anti-patterns — but BBC won&apos;t register
                    a skill from an untrusted source until you&apos;ve read the highlighted span.
                  </div>
                  <label
                    className={`acknowledge ${ack ? "is-on" : ""}`}
                    onClick={() => setAck((a) => !a)}
                  >
                    <span className="box">{ack && <Icons.check />}</span>
                    I&apos;ve reviewed this and want to proceed
                  </label>
                </div>
              </div>
            )}

            {(stage === "flagged" || stage === "done") && (
              <div className="lib-section" style={{ marginTop: 8, paddingTop: 0, borderTop: "none" }}>
                <div className="lab">
                  <span>parsed body</span>
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--muted-2)" }}>
                    SKILL.md · 142 lines · MIT
                  </span>
                </div>
                <div className="lib-skill-preview">
                  <div className="head">
                    <span>pricing-page-copywriter</span>
                    <span className="right">role · marketing · reads voice / product / decision</span>
                  </div>
                  <pre>
                    {bodyParts.map((seg, i) =>
                      /IGNORE PREVIOUS/.test(seg) ? (
                        <span key={i} className="injected">
                          {seg}
                        </span>
                      ) : (
                        <Fragment key={i}>{seg}</Fragment>
                      ),
                    )}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lib-drawer-foot">
          <div className="left">
            {stage === "flagged" ? (
              <>flagged · install blocked until you acknowledge</>
            ) : stage === "idle" ? (
              <>
                paste a public URL · supports <strong>SKILL.md</strong> files or directories
              </>
            ) : (
              <>parsed locally · nothing is registered until you click Install</>
            )}
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={!canInstall}
            style={!canInstall ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
            onClick={runInstall}
          >
            install skill
          </button>
        </div>
      </aside>
    </>
  );
}
