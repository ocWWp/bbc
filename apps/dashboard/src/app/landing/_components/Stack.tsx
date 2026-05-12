import { SafeInline } from "./safe-render";

const rows = [
  { key: "runtime",   val: "<strong>TypeScript + Next.js 16</strong>. one repo, one deploy. no microservices.", tail: "apps/dashboard/" },
  { key: "database",  val: "<strong>Supabase Postgres</strong> with Row-Level Security on every table. no application-layer auth.", tail: "supabase/migrations" },
  { key: "llm",       val: "<strong>Anthropic Claude</strong> by default for extraction and studio. <code>BYOK</code> at /settings/keys (AES-256-GCM at rest).", tail: ".env" },
  { key: "protocol",  val: "<strong>Model Context Protocol</strong> server included — wire any MCP-aware agent to your brain in one config.", tail: "/mcp" },
  { key: "secrets",   val: "<strong>AES-256-GCM</strong> for stored keys. nothing leaves the instance unless you opt in.", tail: "src/lib/encryption.ts" },
  { key: "license",   val: "<strong>AGPLv3</strong> for the application. typed-memory spec lives in <code>/spec</code>.", tail: "LICENSE" },
  { key: "deploy",    val: "<strong>Cloudflare Workers</strong> via OpenNext. or docker. or <code>npm start</code>. self-hosted first, always.", tail: "wrangler.toml" },
];

export function Stack() {
  return (
    <section className="section" id="stack">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow"><span className="num">05</span><span>credibility</span></div>
            <h2 className="section-title">
              the stack, <span className="serif">in seven lines.</span>
            </h2>
          </div>
          <p className="section-blurb">no diagrams. you&apos;ll figure out the rest from the source.</p>
        </div>
        <div className="stack-rows">
          {rows.map((r) => (
            <div className="stack-row" key={r.key}>
              <div className="key">{r.key}</div>
              <div className="val"><SafeInline html={r.val} /></div>
              <div className="tail">{r.tail}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
