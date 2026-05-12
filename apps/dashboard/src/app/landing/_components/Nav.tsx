import { ArrowIcon, GithubIcon } from "./icons";

export function Nav() {
  return (
    <div className="nav">
      <div className="container nav-inner">
        <div className="nav-left">
          <a className="brand" href="#top">
            <span className="brand-mark">bbc</span>
            <span>big brain company</span>
          </a>
          <span className="nav-tag">v0.1 · phase L</span>
        </div>
        <div className="nav-right">
          <nav className="nav-links">
            <a className="nav-link" href="#brain">the brain</a>
            <a className="nav-link" href="#how">three loops</a>
            <a className="nav-link" href="#vs">vs vectors</a>
            <a className="nav-link" href="#install">install</a>
            <a className="nav-link" href="#spec">spec</a>
          </nav>
          <a className="btn btn-ghost" href="https://github.com/ZethT/bbc" target="_blank" rel="noreferrer">
            <GithubIcon /> github
          </a>
          <a className="btn btn-primary" href="/auth/signin">
            try the demo <ArrowIcon />
          </a>
        </div>
      </div>
    </div>
  );
}
