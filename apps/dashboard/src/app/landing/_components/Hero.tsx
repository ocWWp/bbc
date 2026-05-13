import { GithubIcon } from "./icons";
import { Brain3D } from "./Brain3D";
import { LANDING_COPY } from "./copy";

export function Hero() {
  const { hero } = LANDING_COPY;
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
              <span>{hero.eyebrow}</span>
            </div>
            <h1>
              {hero.headline_lead}{" "}
              <span className="serif">{hero.headline_serif}</span>
              <br />
              {hero.headline_tail}
            </h1>
            <p className="hero-sub">{hero.subhead}</p>
            <div className="hero-ctas">
              <a className="btn btn-primary btn-lg" href={hero.cta_primary_href}>
                {hero.cta_primary_label}
              </a>
              <a
                className="btn btn-ghost btn-lg"
                href={hero.cta_secondary_href}
                target="_blank"
                rel="noreferrer"
              >
                <GithubIcon /> {hero.cta_secondary_label}
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
