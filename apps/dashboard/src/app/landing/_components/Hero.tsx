import { ArrowIcon, CloudflareIcon, GithubIcon } from "./icons";
import { Brain3D } from "./Brain3D";

export function Hero() {
  return (
    <section className="hero hero-brain-host" id="top">
      <div className="container hero-inner">
        <div className="hero-split">
          <div className="hero-visual">
            <Brain3D embedded />
          </div>
          <div className="hero-copy">
            <div className="hero-eyebrow">
              <span className="dot" />
              <span>open source · AGPLv3 · self-hosted</span>
              <span style={{ color: "var(--rule-2)" }}>/</span>
              <span>v1.5 beta</span>
            </div>
            <h1>
              the company brain.<br />
              <span className="serif">typed, cited,</span><br />
              writing its own next page.
            </h1>
            <p className="hero-sub">
              nine supertags. one Postgres row per memory. queryable by <em>type</em>, never by similarity. humans review what goes in, agents read what comes out, and over time the brain quietly files proposals back about what your company should do next.
            </p>
            <div className="hero-ctas">
              <a className="btn btn-primary btn-lg" href="/auth/signin">
                <CloudflareIcon /> deploy to cloudflare
              </a>
              <a className="btn btn-ghost btn-lg" href="https://github.com/ZethT/bbc" target="_blank" rel="noreferrer">
                <GithubIcon /> read the source
              </a>
            </div>
            <div className="hero-meta">
              <div className="item"><span className="item-key">stack</span><span className="item-val">typescript · supabase · claude</span></div>
              <div className="item"><span className="item-key">protocol</span><span className="item-val">MCP</span></div>
              <div className="item"><span className="item-key">license</span><span className="item-val">AGPLv3</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
