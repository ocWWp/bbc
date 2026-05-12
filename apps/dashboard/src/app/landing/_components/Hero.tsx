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
              <span>phase L</span>
            </div>
            <h1>
              typed memory<br />
              <span className="serif">for your team and</span><br />
              your agents.
            </h1>
            <p className="hero-sub">
              nine supertags. one Postgres row per memory. queryable by <em>type</em>, never by similarity — small enough to fit in your model&apos;s context, structured enough that an agent never asks twice.
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
