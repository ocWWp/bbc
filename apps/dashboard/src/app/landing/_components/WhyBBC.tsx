import { LANDING_COPY } from "./copy";

export function WhyBBC() {
  const { moat } = LANDING_COPY;
  return (
    <section className="section" id="why">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">
              <span>why bbc</span>
            </div>
            <h2 className="section-title">
              five layers, <span className="serif">each one a moat.</span>
            </h2>
          </div>
          <p className="section-blurb">{moat.intro}</p>
        </div>

        <div className="moat-grid">
          {moat.layers.map((layer, i) => (
            <article className="moat-card" key={layer.title}>
              <div className="moat-card-num">{String(i + 1).padStart(2, "0")}</div>
              <h3 className="moat-card-title">{layer.title}</h3>
              <p className="moat-card-body">{layer.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
