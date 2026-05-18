"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CopyIcon, ExtIcon } from "./icons";

const CODE_TABS = [
  { key: "cli", label: "cli" },
  { key: "mcp", label: "mcp.json" },
  { key: "query", label: "agent.ts" },
  { key: "curl", label: "curl" },
] as const;

type TabKey = (typeof CODE_TABS)[number]["key"];

const CODE: Record<TabKey, ReactNode> = {
  cli: (
    <>
      <span className="c-prompt">$ </span><span>pnpm dlx create-bbc</span>{"\n"}
      <span className="c-prompt">$ </span><span>cd my-brain &amp;&amp; pnpm install</span>{"\n"}
      <span className="c-com">  ✓ scaffolded bbc instance · memory/_schema.md ready</span>{"\n"}
      <span className="c-com">  ✓ 9 supertag tables · row-level security on</span>{"\n"}
      <span className="c-com">  ✓ wrote .env.local · AES-256-GCM key generated</span>{"\n"}
      <span className="c-com">  ✓ MCP server listening at :8787/mcp</span>{"\n"}
      {"\n"}
      <span className="c-prompt">$ </span><span>pnpm bbc dump </span><span className="c-str">./slack-export.json</span>{"\n"}
      <span className="c-com">  parsed 412 messages · proposing 28 typed candidates …</span>{"\n"}
      {"\n"}
      <span className="c-out">  </span><span className="c-fn">voice</span><span className="c-out">           </span><span>4</span>{"\n"}
      <span className="c-out">  </span><span className="c-fn">decision</span><span className="c-out">        </span><span>9</span>{"\n"}
      <span className="c-out">  </span><span className="c-fn">vendor</span><span className="c-out">          </span><span>6</span>{"\n"}
      <span className="c-out">  </span><span className="c-fn">team</span><span className="c-out">            </span><span>3</span>{"\n"}
      <span className="c-out">  </span><span className="c-fn">glossary</span><span className="c-out">        </span><span>6</span>{"\n"}
      {"\n"}
      <span className="c-prompt">$ </span><span>pnpm bbc review </span><span className="c-com"># opens UI at /queue, accept each one</span>{"\n"}
    </>
  ),
  mcp: (
    <>
      <span className="c-com">// ~/.claude/mcp.json — Claude Code reads this on launch</span>{"\n"}
      {"{"}{"\n"}
      {"  "}<span className="c-key">&quot;mcpServers&quot;</span>: {"{"}{"\n"}
      {"    "}<span className="c-key">&quot;bbc&quot;</span>: {"{"}{"\n"}
      {"      "}<span className="c-key">&quot;command&quot;</span>: <span className="c-str">&quot;npx&quot;</span>,{"\n"}
      {"      "}<span className="c-key">&quot;args&quot;</span>: [<span className="c-str">&quot;@bbc/mcp&quot;</span>, <span className="c-str">&quot;--instance&quot;</span>, <span className="c-str">&quot;$BBC_URL&quot;</span>],{"\n"}
      {"      "}<span className="c-key">&quot;env&quot;</span>: {"{"}{"\n"}
      {"        "}<span className="c-key">&quot;BBC_URL&quot;</span>: <span className="c-str">&quot;https://brain.yourco.dev&quot;</span>,{"\n"}
      {"        "}<span className="c-key">&quot;BBC_TOKEN&quot;</span>: <span className="c-str">&quot;$BBC_TOKEN&quot;</span>{"\n"}
      {"      "}{"}"}{"\n"}
      {"    "}{"}"}{"\n"}
      {"  "}{"}"}{"\n"}
      {"}"}{"\n"}
      {"\n"}
      <span className="c-com">// claude now has 9 tools: brain.find, brain.list,</span>{"\n"}
      <span className="c-com">// brain.cite, brain.propose, etc. one per supertag.</span>
    </>
  ),
  query: (
    <>
      <span className="c-key">import</span> {"{ brain, studio }"} <span className="c-key">from</span> <span className="c-str">&quot;@bbc/sdk&quot;</span>;{"\n"}
      {"\n"}
      <span className="c-com">// 1) deterministic by-type lookup</span>{"\n"}
      <span className="c-key">const</span> <span className="c-typ">voice</span> = <span className="c-key">await</span> <span className="c-fn">brain.find</span>({"{"}{"\n"}
      {"  "}supertag: <span className="c-str">&quot;voice&quot;</span>, surface: <span className="c-str">&quot;twitter&quot;</span>,{"\n"}
      {"}"});{"\n"}
      <span className="c-com">// → 1 row or null. never 3 paragraphs.</span>{"\n"}
      {"\n"}
      <span className="c-com">// 2) compose with citations</span>{"\n"}
      <span className="c-key">const</span> <span className="c-typ">post</span> = <span className="c-key">await</span> <span className="c-fn">studio.compose</span>({"{"}{"\n"}
      {"  "}prompt: <span className="c-str">&quot;announce our launch&quot;</span>,{"\n"}
      {"  "}surface: <span className="c-str">&quot;x&quot;</span>,{"\n"}
      {"  "}using: [<span className="c-str">&quot;voice&quot;</span>, <span className="c-str">&quot;decision&quot;</span>, <span className="c-str">&quot;product&quot;</span>],{"\n"}
      {"}"});{"\n"}
      {"\n"}
      <span className="c-typ">post</span>.<span className="c-fn">cites</span>;{" "}<span className="c-com">// → [mem_018a3d, mem_018a40, mem_018a3f]</span>
    </>
  ),
  curl: (
    <>
      <span className="c-prompt">$ </span><span>curl https://brain.yourco.dev/v1/find \</span>{"\n"}
      <span>     -H </span><span className="c-str">&quot;authorization: bearer $BBC_TOKEN&quot;</span><span> \</span>{"\n"}
      <span>     -d </span><span className="c-str">{`'{ "supertag": "vendor", "name": "resend" }'`}</span>{"\n"}
      {"\n"}
      <span className="c-out">{"{"}</span>{"\n"}
      <span className="c-out">  </span><span className="c-key">&quot;id&quot;</span><span className="c-out">: </span><span className="c-str">&quot;mem_018a3e&quot;</span><span className="c-out">,</span>{"\n"}
      <span className="c-out">  </span><span className="c-key">&quot;supertag&quot;</span><span className="c-out">: </span><span className="c-str">&quot;vendor&quot;</span><span className="c-out">,</span>{"\n"}
      <span className="c-out">  </span><span className="c-key">&quot;name&quot;</span><span className="c-out">: </span><span className="c-str">&quot;resend&quot;</span><span className="c-out">,</span>{"\n"}
      <span className="c-out">  </span><span className="c-key">&quot;key_handle&quot;</span><span className="c-out">: </span><span className="c-str">&quot;RESEND_KEY&quot;</span><span className="c-out">,</span>{"\n"}
      <span className="c-out">  </span><span className="c-key">&quot;source&quot;</span><span className="c-out">: </span><span className="c-str">&quot;slack/#ops/2026-04-22&quot;</span><span className="c-out">,</span>{"\n"}
      <span className="c-out">  </span><span className="c-key">&quot;reviewed_by&quot;</span><span className="c-out">: </span><span className="c-str">&quot;you@yourco.dev&quot;</span><span className="c-out">,</span>{"\n"}
      <span className="c-out">  </span><span className="c-key">&quot;reviewed_at&quot;</span><span className="c-out">: </span><span className="c-str">&quot;2026-04-22T18:04:11Z&quot;</span>{"\n"}
      <span className="c-out">{"}"}</span>
    </>
  ),
};

const STEPS = [
  {
    key: "cli" as TabKey,
    eyebrow: "01 · install",
    title: "Install the CLI, scaffold your brain.",
    body: (
      <>
        one command. <code>create-bbc</code> sets up your brain: nine typed tables with row-level security, encrypted keys, and an MCP server on <code>:8787</code>.
      </>
    ),
    refs: ["create-bbc", "AES-256-GCM"],
  },
  {
    key: "mcp" as TabKey,
    eyebrow: "02 · connect",
    title: "Wire it into Claude (or any MCP agent).",
    body: (
      <>
        add one block to <code>~/.claude/mcp.json</code>. claude gets nine typed tools — <code>brain.find</code>, <code>brain.cite</code>, <code>brain.propose</code> — one per memory type.
      </>
    ),
    refs: ["MCP", "9 tools"],
  },
  {
    key: "query" as TabKey,
    eyebrow: "03 · query",
    title: "Lookups are by type, never by similarity.",
    body: (
      <>
        a <code>brain.find</code> call returns one row or null. no ranking, no top-k. compose answers and the SDK returns citations alongside the text.
      </>
    ),
    refs: ["one row or null", "post.cites"],
  },
  {
    key: "curl" as TabKey,
    eyebrow: "04 · http",
    title: "Or skip the SDK and hit the REST endpoint.",
    body: (
      <>
        bearer-token auth. same shape across every memory type. every response carries <code>reviewed_by</code> and <code>reviewed_at</code> so you can trust what comes back.
      </>
    ),
    refs: ["bearer", "reviewed_at"],
  },
];

export function CodeBlock() {
  const [active, setActive] = useState<TabKey>("cli");
  const [copied, setCopied] = useState(false);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const copy = () => { setCopied(true); setTimeout(() => setCopied(false), 1200); };

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        let best: TabKey | null = null;
        let score = -1;
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > score) {
            score = e.intersectionRatio;
            best = (e.target as HTMLElement).dataset.step as TabKey;
          }
        }
        if (best) setActive(best);
      },
      { rootMargin: "-25% 0px -55% 0px", threshold: [0.1, 0.4, 0.7] },
    );
    Object.values(refs.current).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section className="section" id="install">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow"><span className="num">04</span><span>install</span></div>
            <h2 className="section-title">
              we ship <span className="serif">the seams</span> on purpose.
            </h2>
          </div>
          <p className="section-blurb">
            four shapes you&apos;ll touch. read top to bottom — the code on the right follows you.
          </p>
        </div>

        <div className="doc-grid">
          <div className="doc-prose">
            {STEPS.map((s) => (
              <div
                key={s.key}
                ref={(el) => { refs.current[s.key] = el; }}
                data-step={s.key}
                className={"doc-step " + (active === s.key ? "is-active" : "")}
                onClick={() => setActive(s.key)}
              >
                <div className="doc-step-eyebrow">{s.eyebrow}</div>
                <h3 className="doc-step-title">{s.title}</h3>
                <p className="doc-step-body">{s.body}</p>
                <div className="doc-step-refs">
                  {s.refs.map((r) => <code key={r}>{r}</code>)}
                </div>
              </div>
            ))}
            <div className="doc-step-end">
              <a className="btn btn-ghost" href="#"><ExtIcon /> full reference · coming soon</a>
            </div>
          </div>

          <div className="doc-code-col">
            <div className="doc-code-sticky">
              <div className="code-block">
                <div className="code-tabs">
                  {CODE_TABS.map((t) => (
                    <button
                      key={t.key}
                      className={`code-tab ${active === t.key ? "is-active" : ""}`}
                      onClick={() => setActive(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                  <div className="spacer" />
                  <button className="copy" onClick={copy}><CopyIcon /> {copied ? "copied" : "copy"}</button>
                </div>
                <pre className="code-pre">{CODE[active]}</pre>
                <div className="code-foot">
                  <span>BBC never stores LLM keys server-side. BYOK is opt-in, AES-256-GCM at rest.</span>
                  <span>docs/{active === "mcp" ? "agents" : active === "query" ? "sdk" : active === "curl" ? "rest" : "cli"}.md</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
