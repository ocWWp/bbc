import { CloudflareIcon, GithubIcon, ExtIcon } from "./icons";

export function CTA() {
  return (
    <section className="cta">
      <div className="container cta-inner">
        <div className="cta-card is-primary">
          <div className="cta-eyebrow">▲ one-click self-host</div>
          <h3 className="cta-title">
            deploy to cloudflare.<br />own the brain.
          </h3>
          <p className="cta-body">
            OpenNext + Workers. spins up in under a minute. your data never leaves your account. byo postgres if you prefer.
          </p>
          <div className="cta-foot">
            <a
              className="btn btn-lg"
              href="https://deploy.workers.cloudflare.com/?url=https://github.com/ocWWp/bbc"
              target="_blank"
              rel="noreferrer"
            >
              <CloudflareIcon /> deploy
            </a>
            <span
              className="mono"
              style={{
                fontSize: 11,
                color: "color-mix(in oklab, var(--bg), transparent 50%)",
              }}
            >
              ~60s · free tier ok
            </span>
          </div>
        </div>
        <div className="cta-card">
          <div className="cta-eyebrow">★ open source</div>
          <h3 className="cta-title">
            read the source.<br />star the repo.
          </h3>
          <p className="cta-body">
            AGPLv3. roadmap and ADRs in the open. the typed-memory schema lives in <span className="mono">memory/_schema.md</span> for anyone who wants to ship their own implementation.
          </p>
          <div className="cta-foot">
            <a
              className="btn btn-ghost btn-lg"
              href="https://github.com/ocWWp/bbc"
              target="_blank"
              rel="noreferrer"
            >
              <GithubIcon /> github.com/ocWWp/bbc
            </a>
            <a
              className="btn btn-ghost btn-lg"
              href="https://github.com/ocWWp/bbc/blob/main/memory/_schema.md"
              target="_blank"
              rel="noreferrer"
            >
              read the spec <ExtIcon />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
