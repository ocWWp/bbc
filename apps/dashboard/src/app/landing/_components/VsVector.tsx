import type { CSSProperties } from "react";
import { Tag } from "./Tag";

export function VsVector() {
  return (
    <section className="section" id="vs">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow"><span className="num">03</span><span>vs vector stores</span></div>
            <h2 className="section-title">
              &quot;why not just <span className="serif">embed everything?</span>&quot;
            </h2>
          </div>
          <p className="section-blurb">
            same query. one product retrieves three vaguely-related paragraphs sorted by cosine distance. the other retrieves one row, typed and cited.
          </p>
        </div>

        <div className="vs">
          <div className="vs-card is-them">
            <div className="vs-head">
              <span className="name">vector store</span>
              <span className="label">k-nearest paragraphs</span>
            </div>
            <div className="vs-query">
              <span className="q">query →</span>what&apos;s our refund policy?
            </div>
            <div className="vs-result vec">
              <div className="vs-chunk">
                &quot;…and we&apos;ll be issuing a one-time refund to customers affected by the april outage, see also…&quot;
                <span className="score">0.84</span>
              </div>
              <div className="vs-chunk">
                &quot;…the team discussed adjusting refund thresholds in Q3, devon to follow up next sprint with a draft policy doc…&quot;
                <span className="score">0.79</span>
              </div>
              <div className="vs-chunk">
                &quot;…stripe handles refunds automatically for failed payments. for everything else, see #ops…&quot;
                <span className="score">0.71</span>
              </div>
            </div>
            <div className="vs-foot">
              <div className="row"><span>determinism</span><strong>no — depends on embedding model + k</strong></div>
              <div className="row"><span>citation</span><strong>chunk ids, no semantics</strong></div>
              <div className="row"><span>when the answer doesn&apos;t exist</span><strong>returns the next closest thing anyway</strong></div>
            </div>
          </div>

          <div className="vs-card">
            <div className="vs-head">
              <span className="name">bbc</span>
              <span className="label">typed query</span>
            </div>
            <div className="vs-query">
              <span className="q">query →</span>
              <span className="mono">
                brain.find(&#123; supertag:{" "}
                <span style={{ color: "var(--t-decision)" } as CSSProperties}>&quot;decision&quot;</span>, slug:{" "}
                <span style={{ color: "var(--t-note)" } as CSSProperties}>&quot;refund-policy&quot;</span> &#125;)
              </span>
            </div>
            <div className="vs-result bbc">
              <div style={{ marginBottom: 8 }}>
                <Tag name="decision" />{" "}
                <span
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 11,
                    color: "var(--muted)",
                    marginLeft: 6,
                  }}
                >
                  mem_018b2a · reviewed 2026-03-11
                </span>
              </div>
              full refund within 14 days, no questions. after 14 days, prorated by usage. exceptions require maintainer approval and are logged in{" "}
              <span
                className="mono"
                style={{ background: "var(--bg-2)", padding: "1px 5px", borderRadius: 4 }}
              >
                adr/0014
              </span>.
            </div>
            <div className="vs-foot">
              <div className="row"><span>determinism</span><strong>yes — one row or zero</strong></div>
              <div className="row"><span>citation</span><strong>memory id, source artifact, reviewer</strong></div>
              <div className="row"><span>when the answer doesn&apos;t exist</span><strong>returns <code>null</code>. the agent knows to ask.</strong></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
