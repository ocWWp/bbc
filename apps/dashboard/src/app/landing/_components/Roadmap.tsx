import { LANDING_COPY } from "./copy";

export function Roadmap() {
  const { roadmap } = LANDING_COPY;
  return (
    <section className="section" id="roadmap">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow"><span>{roadmap.eyebrow}</span></div>
            <h2 className="section-title">
              {roadmap.title_lead}{" "}
              <span className="serif">{roadmap.title_serif}</span>
            </h2>
          </div>
          <p className="section-blurb">{roadmap.blurb}</p>
        </div>

        <div className="moat-grid">
          {roadmap.loops.map((loop) => (
            <article className="moat-card" key={loop.num}>
              <div className="roadmap-card-head">
                <div className="moat-card-num">{loop.num}</div>
                <span className={`roadmap-status is-${loop.status_label}`}>
                  <span aria-hidden>{loop.status_glyph}</span> {loop.status_label}
                </span>
              </div>
              <h3 className="moat-card-title">{loop.title}</h3>
              <p className="moat-card-body">{loop.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
