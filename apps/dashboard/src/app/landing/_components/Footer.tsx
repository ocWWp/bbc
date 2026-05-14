import { ExtIcon } from "./icons";

export function Footer() {
  return (
    <footer className="foot">
      <div className="container">
        <div className="foot-top">
          <div className="foot-brand">
            <div className="brand">
              <span className="brand-mark">bbc</span>
              <span>big brain company</span>
            </div>
            <p className="desc">
              an open-source structured company brain. nine supertags, human-reviewed, deterministic by design. three compounding loops on top of one schema.
            </p>
          </div>
          <div className="foot-col">
            <h4>product</h4>
            <a href="#brain">the brain</a>
            <a href="#how">three loops</a>
            <a href="#install">install</a>
            <a href="/studio/marketing">marketing studio</a>
            <a href="/settings/api-keys">mcp server</a>
          </div>
          <div className="foot-col">
            <h4>build with bbc</h4>
            <a href="#spec">spec</a>
            <a href="#">sdk reference</a>
            <a href="#">rest api</a>
            <a href="#">claude / gpt agents</a>
            <a href="#">cookbook</a>
          </div>
          <div className="foot-col">
            <h4>open source</h4>
            <a href="https://github.com/ZethT/bbc" target="_blank" rel="noreferrer">github</a>
            <a href="https://github.com/ZethT/bbc/blob/main/.planning/ROADMAP.md" target="_blank" rel="noreferrer">roadmap</a>
            <a href="https://github.com/ZethT/bbc/tree/main/memory/decisions" target="_blank" rel="noreferrer">adrs</a>
            <a href="#">contributors</a>
          </div>
        </div>
        <div className="foot-bottom">
          <div className="license">
            <span>© 2026 big brain company</span>
            <a href="https://github.com/ZethT/bbc/blob/main/LICENSE" target="_blank" rel="noreferrer">
              AGPLv3 — read the license
            </a>
          </div>
          <a className="spec" href="#spec">
            /spec/typed-memory-v1.md <ExtIcon />
          </a>
        </div>
      </div>
    </footer>
  );
}
