/* global React, I, LI, Tag, LibCard, RecCard, DetailDrawer, SchemaChip, PageHead, Annot */

const { LIB } = window;

// ============================================================
// IMPORT FROM URL — drawer with parse pipeline + flagged state
// ============================================================
function ImportDrawer({ onClose, flaggedDefault }) {
  const [url, setUrl] = React.useState("github.com/swyx/agentskills/blob/main/pricing-page.md");
  const [stage, setStage] = React.useState(flaggedDefault ? "flagged" : "idle");
  // stages: idle | fetching | parsing | registering | done | flagged | error
  const [ack, setAck] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function runFetch() {
    setStage("fetching");
    setTimeout(() => setStage("parsing"), 600);
    setTimeout(() => setStage("flagged"), 1300);
  }

  const steps = [
    { key: "fetch",      lbl: "Fetching SKILL.md",                              meta: "GET /raw/…" },
    { key: "parse",      lbl: "Parsing frontmatter + body",                     meta: "yaml + md" },
    { key: "scan",       lbl: "Scanning body for prompt-injection patterns",    meta: "regex + heuristics" },
    { key: "register",   lbl: "Registering skill in /library/skills",           meta: "→ workspace" },
  ];
  function statusFor(idx) {
    if (stage === "idle")       return "idle";
    if (stage === "fetching")   return idx === 0 ? "run" : "idle";
    if (stage === "parsing")    return idx < 1 ? "done" : idx === 1 ? "run" : "idle";
    if (stage === "flagged")    return idx < 2 ? "done" : idx === 2 ? "err" : "idle";
    if (stage === "registering")return idx < 3 ? "done" : idx === 3 ? "run" : "idle";
    if (stage === "done")       return "done";
    return "idle";
  }

  // body with mock injection
  const body = LIB.IMPORT_FLAGGED_BODY.split(
    /(IGNORE PREVIOUS INSTRUCTIONS[\s\S]*?paragraph of the pricing page\.)/
  );

  const canInstall = stage === "flagged" ? ack : (stage === "parsing" || stage === "registering" || stage === "done");

  return (
    <>
      <div className="lib-drawer-scrim" onClick={onClose} />
      <aside className="lib-drawer" role="dialog" aria-label="Import a skill from URL">
        <div className="lib-drawer-head">
          <div className="crumb">
            library / skills / <strong>import from URL</strong>
          </div>
          <button className="close" onClick={onClose} aria-label="Close"><I.x /></button>
        </div>

        <div className="lib-drawer-body">
          <h2 style={{ fontFamily:"Geist", fontSize: 24, fontWeight: 500, letterSpacing:"-0.02em", margin: "0 0 6px" }}>
            Import a skill <span className="serif">from URL</span>.
          </h2>
          <p className="lede">
            Paste a GitHub URL pointing at a <code style={{background:"var(--bg-2)", border:"1px solid var(--rule)", padding:"1px 5px", borderRadius:4, fontFamily:"Geist Mono", fontSize:"0.86em"}}>SKILL.md</code> file
            or a directory of them. BBC fetches the body, parses the frontmatter, scans for prompt-injection patterns, then registers the skill in your workspace.
          </p>

          <div className="lib-import-stage">
            <div className="lib-import-input">
              <div className="url-box">
                <span className="scheme">https://</span>
                <input
                  type="text"
                  value={url}
                  onChange={(e)=>setUrl(e.target.value)}
                  placeholder="github.com/owner/repo/path/to/SKILL.md"
                  aria-label="Skill URL"
                />
              </div>
              <button className="btn btn-primary btn-lg" onClick={runFetch}>fetch</button>
            </div>

            {(stage !== "idle") && (
              <div className="lib-import-progress">
                {steps.map((s, i) => {
                  const st = statusFor(i);
                  return (
                    <div key={s.key} className={`step ${st}`}>
                      <span className="n">
                        {st === "done" ? <LI.check /> : st === "err" ? <LI.warn /> : st === "run" ? <span className="lib-spinner" /> : i+1}
                      </span>
                      <span className="lbl">{s.lbl}</span>
                      <span className="meta">{s.meta}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {stage === "flagged" && (
              <div className="lib-import-flag">
                <div className="glyph">!</div>
                <div>
                  <div className="ttl">Import flagged for review</div>
                  <div className="body">
                    The body contains a span that matches a known prompt-injection pattern
                    (<code style={{fontFamily:"Geist Mono", fontSize: "0.92em"}}>IGNORE PREVIOUS INSTRUCTIONS</code>). It may be benign — instructional snippets often
                    contain anti-patterns — but BBC won't register a skill from an untrusted source until you've read the highlighted span.
                  </div>
                  <label className={`acknowledge ${ack ? "is-on" : ""}`} onClick={()=>setAck(a => !a)}>
                    <span className="box">{ack && <LI.check />}</span>
                    I've reviewed this and want to proceed
                  </label>
                </div>
              </div>
            )}

            {(stage === "flagged" || stage === "done") && (
              <div className="lib-section" style={{marginTop: 8, paddingTop: 0, borderTop: "none"}}>
                <div className="lab">
                  <span>parsed body</span>
                  <span className="mono" style={{fontSize: 10.5, color:"var(--muted-2)"}}>SKILL.md · 142 lines · MIT</span>
                </div>
                <div className="lib-skill-preview">
                  <div className="head">
                    <span>pricing-page-copywriter</span>
                    <span className="right">role · marketing · reads voice / product / decision</span>
                  </div>
                  <pre>{body.map((seg, i) =>
                    /IGNORE PREVIOUS/.test(seg)
                      ? <span key={i} className="injected">{seg}</span>
                      : <React.Fragment key={i}>{seg}</React.Fragment>
                  )}</pre>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lib-drawer-foot">
          <div className="left">
            {stage === "flagged"
              ? <>flagged · install blocked until you acknowledge</>
              : stage === "idle"
                ? <>paste a public URL · supports <strong>SKILL.md</strong> files or directories</>
                : <>parsed locally · nothing is registered until you click Install</>
            }
          </div>
          <button className="btn btn-ghost" onClick={onClose}>cancel</button>
          <button
            className="btn btn-primary btn-lg"
            disabled={!canInstall}
            style={!canInstall ? { opacity: 0.45, cursor: "not-allowed" } : null}
            onClick={() => { setStage("registering"); setTimeout(() => setStage("done"), 700); }}
          >
            install skill
          </button>
        </div>
      </aside>
    </>
  );
}

// ============================================================
// PAGE LIBRARY
// ============================================================
function PageLibrary(props) {
  const tab        = props.tab;          // "default" | "skills" | "connectors" | "providers"
  const setTab     = props.setTab;
  const state      = props.state;        // "default" | "empty" | "installing" | "error" | "search"
  const detailOpen = props.detailOpen;   // null | { item, kind }
  const setDetail  = props.setDetail;
  const importOpen = props.importOpen;
  const setImportOpen = props.setImportOpen;
  const importFlagged = props.importFlagged;

  const [search, setSearch]     = React.useState(state === "search" ? "marketing post" : "");
  const [filter, setFilter]     = React.useState("all");
  const [onlyInst, setOnlyInst] = React.useState(false);
  const [installingId, setInstallingId] = React.useState(state === "installing" ? "co_003" : null);
  const [focused, setFocused]   = React.useState(null);

  // sync search field with the "search results state"
  React.useEffect(() => {
    if (state === "search") setSearch("marketing post");
  }, [state]);

  // ---------- which category to show ----------
  const activeCat = tab;

  // ---------- filter chips definition per tab ----------
  const filterDef = activeCat === "skills"
    ? { key: "role",   chips: LIB.ROLE_FILTERS,   label: "by role",   colorOf: (k) => k === "all" ? null : LIB.ROLE_COLOR[k] }
    : activeCat === "connectors"
      ? { key: "source", chips: LIB.SOURCE_FILTERS, label: "by source", colorOf: () => null }
      : { key: "role",   chips: LIB.PROV_FILTERS,   label: "by role",   colorOf: () => null };

  // ---------- count installed ----------
  const allItems = activeCat === "skills" ? LIB.SKILLS
                  : activeCat === "connectors" ? LIB.CONNECTORS
                  : LIB.PROVIDERS;
  const installedCount = allItems.filter(x => activeCat === "providers" ? x.connected : x.installed).length;

  // ---------- final visible list (after filter, search, installed-toggle) ----------
  const filtered = allItems.filter(x => {
    if (filter !== "all") {
      if (activeCat === "skills"     && x.role   !== filter) return false;
      if (activeCat === "connectors" && x.source !== filter) return false;
      if (activeCat === "providers"  && x.role   !== filter) return false;
    }
    if (onlyInst) {
      if (activeCat === "providers" && !x.connected) return false;
      if (activeCat !== "providers" && !x.installed) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (!(x.name.toLowerCase().includes(q) || x.desc.toLowerCase().includes(q) || x.author.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  // ---------- handlers ----------
  function handleOpen(item, kind) {
    setFocused(item.id);
    setDetail({ item, kind });
  }
  function handleInstall(item, kind) {
    setInstallingId(item.id);
    setTimeout(() => setInstallingId(null), 1600);
  }

  // ============================================================
  // EMPTY-TENANT STATE
  // ============================================================
  if (state === "empty") {
    return (
      <div className="container page">
        <PageHead
          crumb={<><a href="#">acme</a><span className="sep">/</span><span className="current">library</span></>}
          title={<>Your <span className="serif">library</span> is fresh.</>}
          blurb="Five built-in skills are ready. Three starter packs below bundle the right skills + connectors for the most common shapes of company. You can also browse everything à la carte under the tabs."
          actions={<button className="btn btn-ghost" onClick={()=>setImportOpen(true)}>import from URL</button>}
        />

        <div className="rec-band">
          <div className="rec-band-head">
            <div>
              <div className="eyebrow"><span className="dot" />starter packs</div>
              <div className="title">Pick a shape that fits your company.</div>
            </div>
            <span className="why">One click installs the bundle · everything still review-gated.</span>
          </div>
          <div className="pack-row">
            {LIB.STARTER_PACKS.map(p => (
              <article key={p.id} className="pack-card" style={{ "--pack-color": p.color }}>
                <div className="pack-head">
                  <div className="pack-eyebrow">starter · {p.bundle.length} items</div>
                  <span className="pill muted">{p.bundle.filter(b=>b.kind==="skill").length} skills · {p.bundle.filter(b=>b.kind==="connector").length} connectors</span>
                </div>
                <div>
                  <h3>{p.title}</h3>
                  <p className="pack-desc">{p.desc}</p>
                </div>
                <div className="pack-bundle">
                  {p.bundle.map((b, i) => (
                    <div key={i} className="row">
                      <span className="kind">{b.kind}</span>
                      <span>{b.name}</span>
                    </div>
                  ))}
                </div>
                <div className="pack-foot">
                  <span className="summary">files {p.bundle.length} review proposals</span>
                  <button className="btn btn-primary">install pack →</button>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", marginTop: 32, paddingTop: 24, borderTop:"1px solid var(--rule)"}}>
          <div>
            <div className="section-eyebrow" style={{margin: 0}}>built-in · 5 skills</div>
            <h3 style={{fontFamily:"Geist", fontSize: 20, fontWeight: 500, letterSpacing:"-0.02em", margin: "6px 0 0"}}>Or start with the basics, one at a time.</h3>
          </div>
          <button className="btn btn-ghost" onClick={()=>setTab("skills")}>browse all skills →</button>
        </div>
        <div className="lib-grid" style={{marginTop: 20}}>
          {LIB.SKILLS.filter(s => s.author === "BBC").slice(0, 5).map(item => (
            <LibCard key={item.id} item={item} kind="skill" installingId={installingId} onOpen={handleOpen} onInstall={handleInstall} />
          ))}
        </div>

        <Annot
          rationale={`Empty-tenant first impression: three high-leverage choices ('Marketing-focused', 'Engineering-focused', 'Solo indie hacker') as starter packs, then the five built-in skills as the à-la-carte path. Import-from-URL is present as a ghost action in the header — discoverable but not loud. The information-density gradient kicks in only once the user picks a tab.`}
          primitives={`<code>.rec-band</code> (band header + grid), <code>.pack-card</code> (starter pack), <code>.lib-card</code> + <code>.lib-grid</code>. Reuses the page header, eyebrow, and supertag chip system.`}
        />
      </div>
    );
  }

  // ============================================================
  // DEFAULT / SKILLS / CONNECTORS / PROVIDERS — single layout
  // ============================================================
  const titleNode = activeCat === "default"
    ? <>Browse the <span className="serif">library</span>.</>
    : activeCat === "skills"     ? <>Skills <span className="serif">— role templates</span></>
    : activeCat === "connectors" ? <>Connectors <span className="serif">— typed ingest</span></>
                                 : <>Providers <span className="serif">— vendor adapters</span></>;

  const blurb = activeCat === "default"
    ? "Three categories: skills are role templates that drive studios; connectors map external sources to supertag memory; providers are the vendor adapters underneath. Every install is review-gated in /queue."
    : activeCat === "skills"     ? "Role templates that drive a studio. Each skill declares which supertags it reads and (sometimes) writes. Importable from any github SKILL.md."
    : activeCat === "connectors" ? "Map external sources to supertag memory. Connectors never write memory directly — they file proposals to /queue, which you review."
                                 : "Vendor adapters underneath the studios. LLMs, datastores, email, hosting. Bring your own keys.";

  return (
    <div className="container page" style={{paddingBottom: 96}}>
      <PageHead
        crumb={<><a href="#">acme</a><span className="sep">/</span><span className="current">library</span>{activeCat !== "default" && <><span className="sep">/</span><span className="current">{activeCat}</span></>}</>}
        title={titleNode}
        blurb={blurb}
        actions={
          <>
            {activeCat === "skills" && (
              <button className="btn btn-ghost" onClick={()=>setImportOpen(true)}><LI.link /> import from URL</button>
            )}
            <button className="btn btn-ghost">view on github →</button>
          </>
        }
      />

      {/* Top sub-tabs */}
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap: 14, marginBottom: 24}}>
        <div className="tabs">
          {[
            { key: "default",    lab: "Overview",   ct: null },
            { key: "skills",     lab: "Skills",     ct: LIB.SKILLS.length },
            { key: "connectors", lab: "Connectors", ct: LIB.CONNECTORS.length },
            { key: "providers",  lab: "Providers",  ct: LIB.PROVIDERS.length },
          ].map(t => (
            <button key={t.key} className={activeCat === t.key ? "is-active" : ""} onClick={()=>setTab(t.key)}>
              {t.lab}
              {t.ct !== null && <span className="mono" style={{marginLeft: 6, fontSize: 11, color: activeCat===t.key ? "color-mix(in oklab, var(--bg), transparent 35%)" : "var(--muted)"}}>{t.ct}</span>}
            </button>
          ))}
        </div>
        <div style={{display:"flex", alignItems:"center", gap: 10, fontFamily:"Geist Mono, monospace", fontSize: 11.5, color:"var(--muted)"}}>
          <span>{installedCount} installed</span>
          <span style={{color:"var(--rule-2)"}}>·</span>
          <span>{allItems.length} available</span>
        </div>
      </div>

      {/* DEFAULT: recommended band over a slice of each category */}
      {activeCat === "default" && (
        <>
          <RecommendedBand
            onOpen={handleOpen}
            onInstall={handleInstall}
          />

          {/* mini slices */}
          <CategorySlice tab="skills"     title="Skills"     items={LIB.SKILLS.slice(0,3)}     onOpen={handleOpen} onInstall={handleInstall} installingId={installingId} setTab={setTab} kind="skill" />
          <CategorySlice tab="connectors" title="Connectors" items={LIB.CONNECTORS.slice(0,3)} onOpen={handleOpen} onInstall={handleInstall} installingId={installingId} setTab={setTab} kind="connector" />
          <CategorySlice tab="providers"  title="Providers"  items={LIB.PROVIDERS.slice(0,3)}  onOpen={handleOpen} onInstall={handleInstall} installingId={installingId} setTab={setTab} kind="provider" />

          <Annot
            rationale={`Overview surfaces curation first: recommended band at the top (founder default path), then a sample row of each category to let users dive in. Power-user controls (search, filters, the URL importer, the installed-only toggle) live one tab down — discoverable but not visually loud. This is the information-density gradient: simple at the top, dense by the time you're scanning the Skills tab.`}
            primitives={`<code>.tabs</code> (existing), <code>.rec-band</code>, <code>.rec-card</code>, <code>.lib-grid</code>, <code>.lib-card</code>. Section breaks reuse the existing eyebrow + serif-italic title rhythm.`}
          />
        </>
      )}

      {/* CATEGORY TABS — full populated experience */}
      {activeCat !== "default" && (
        <>
          {/* error banner */}
          {state === "error" && (
            <div className="error-banner">
              <div className="glyph">!</div>
              <div className="body">
                <strong>Connector install failed — Linear OAuth returned <code>invalid_grant</code></strong>
                <div className="sub">scope mismatch · the app expects <code>read:issues</code> but the OAuth response granted <code>read:users</code> only. Re-authorize from the Linear admin panel.</div>
              </div>
              <button className="btn btn-ghost">retry</button>
            </div>
          )}

          {/* installing banner */}
          {state === "installing" && (
            <div className="installing-banner" style={{ "--role-color": "var(--t-source_artifact)" }}>
              <div className="glyph">L</div>
              <div className="body">
                <strong>Linear</strong> · OAuth complete · first sync running…
                <span className="sub">182 / ~2,400 issues · proposals filed to /queue · est. 2m remaining</span>
              </div>
              <div className="right">
                <span className="pill ok"><span className="dot" /> syncing</span>
                <button className="btn btn-ghost">view in /queue</button>
              </div>
            </div>
          )}

          {/* Recommended band — collapsed sub-view */}
          {activeCat !== "providers" && (
            <RecommendedBand small onOpen={handleOpen} onInstall={handleInstall} />
          )}

          {/* Toolbar: search · filters · installed toggle */}
          <div className="lib-toolbar">
            <div className="lib-search">
              <span className="lib-search-ic"><LI.search /></span>
              <input
                placeholder={`search ${activeCat}…`}
                value={search}
                onChange={(e)=>setSearch(e.target.value)}
                autoFocus
                aria-label="Search library"
              />
              <span className="kbd">/</span>
              {search && <button className="clear" onClick={()=>setSearch("")} aria-label="Clear search"><LI.x /></button>}
            </div>
            <button
              className={`installed-pill ${onlyInst ? "is-on" : ""}`}
              onClick={()=>setOnlyInst(v => !v)}
              aria-pressed={onlyInst}
            >
              <span className="box">{onlyInst && <LI.check />}</span>
              installed only <span className="ct">{installedCount}</span>
            </button>
          </div>

          {/* Category filter chips */}
          <div className="lib-chiprow" role="tablist" aria-label={filterDef.label}>
            {filterDef.chips.map(c => {
              const color = filterDef.colorOf(c);
              const ct = c === "all" ? allItems.length
                : activeCat === "skills"     ? LIB.SKILLS.filter(s => s.role === c).length
                : activeCat === "connectors" ? LIB.CONNECTORS.filter(co => co.source === c).length
                                             : LIB.PROVIDERS.filter(pr => pr.role === c).length;
              return (
                <button
                  key={c}
                  className={`lib-chip ${filter === c ? "is-on" : ""}`}
                  onClick={()=>setFilter(c)}
                  style={color ? { "--chip-color": color } : null}
                  role="tab"
                  aria-selected={filter === c}
                >
                  {color && <span className="dot" />}
                  {c}
                  <span className="ct">{ct}</span>
                </button>
              );
            })}
          </div>

          {/* Search active sub-line */}
          {search && (
            <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom: 12, fontFamily:"Geist Mono, monospace", fontSize: 11.5, color:"var(--muted)"}}>
              <span>{filtered.length} result{filtered.length === 1 ? "" : "s"} for "<span style={{color:"var(--ink)"}}>{search}</span>"</span>
              <button className="btn btn-ghost" style={{height:24, padding:"0 8px", fontSize:11}} onClick={()=>setSearch("")}>clear</button>
            </div>
          )}

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className="empty">
              <div className="e-eyebrow">no matches</div>
              <h2 className="e-title">Nothing in this slice yet.</h2>
              <p className="e-body">Loosen the filter, clear the search, or paste a skill URL to add one.</p>
              <div className="e-actions">
                <button className="btn btn-ghost" onClick={()=>{setSearch(""); setFilter("all"); setOnlyInst(false);}}>clear filters</button>
                {activeCat === "skills" && <button className="btn btn-primary" onClick={()=>setImportOpen(true)}>import from URL</button>}
              </div>
            </div>
          ) : (
            <div className="lib-grid">
              {filtered.map(item => (
                <LibCard
                  key={item.id}
                  item={item}
                  kind={activeCat === "skills" ? "skill" : activeCat === "connectors" ? "connector" : "provider"}
                  focused={focused === item.id}
                  installingId={installingId}
                  onOpen={handleOpen}
                  onInstall={handleInstall}
                />
              ))}
            </div>
          )}

          <Annot
            rationale={`Toolbar (search + installed-only toggle) is the indie-hacker entry point — keyboard-first, dense, every control visible. Filter chips sit one row below so they don't compete with search; the chip rail uses the same role-color tokens as supertags so the user's mental model of "marketing = magenta" carries through. Cards expose author + license + types upfront — the trust+provenance signal the brief calls 'the killer differentiator'.`}
            primitives={`<code>.lib-toolbar</code>, <code>.lib-search</code>, <code>.installed-pill</code>, <code>.lib-chiprow</code> + <code>.lib-chip</code>, <code>.lib-grid</code> + <code>.lib-card</code>, <code>.schema-chip</code> (extends <code>.tag</code>).`}
          />
        </>
      )}
    </div>
  );
}

// ---------- Recommended band component ----------
function RecommendedBand({ small, onOpen, onInstall }) {
  const items = [
    { ref: LIB.SKILLS.find(s => s.id === "sk_003"), kind: "skill",
      why: <>Founder role detected · no recap skill installed · syncs to <strong>team + decision</strong> memory.</> },
    { ref: LIB.CONNECTORS.find(c => c.id === "co_003"), kind: "connector",
      why: <>You have <strong>3 product rows</strong> and <strong>9 decision rows</strong> but no <strong>tasks</strong> source.</> },
    { ref: LIB.SKILLS.find(s => s.id === "sk_005"), kind: "skill",
      why: <>Support role detected · <strong>glossary</strong> is your second-largest type but no skill reads it yet.</> },
    { ref: LIB.SKILLS.find(s => s.id === "sk_012"), kind: "skill",
      why: <>Your read-set covers 4 supertags · <strong>5 left unreferenced</strong>. This skill flags the gap.</> },
  ];
  return (
    <div className="rec-band">
      <div className="rec-band-head">
        <div>
          <div className="eyebrow"><span className="dot" />recommended for you</div>
          {!small && <div className="title">Based on your roles · memory shape · and gaps.</div>}
        </div>
        {!small && <span className="why">Hide for power users · BBC explains every recommendation.</span>}
        {small && <button className="collapse">hide for now</button>}
      </div>
      <div className="rec-row">
        {items.map((it, i) => it.ref && (
          <RecCard
            key={i}
            item={{ ...it.ref, why: it.why }}
            kind={it.kind}
            onOpen={onOpen}
            onInstall={onInstall}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Category slice (overview tab) ----------
function CategorySlice({ tab, title, items, onOpen, onInstall, installingId, setTab, kind }) {
  return (
    <section style={{marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--rule)"}}>
      <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom: 16}}>
        <div>
          <div className="section-eyebrow" style={{margin: 0}}>{tab} · {(tab === "skills" ? LIB.SKILLS.length : tab === "connectors" ? LIB.CONNECTORS.length : LIB.PROVIDERS.length)} total</div>
          <h3 style={{fontFamily:"Geist", fontSize: 22, fontWeight: 500, letterSpacing:"-0.02em", margin: "6px 0 0"}}>{title}</h3>
        </div>
        <button className="btn btn-ghost" onClick={()=>setTab(tab)}>browse all →</button>
      </div>
      <div className="lib-grid">
        {items.map(item => (
          <LibCard key={item.id} item={item} kind={kind} installingId={installingId} onOpen={onOpen} onInstall={onInstall} />
        ))}
      </div>
    </section>
  );
}

window.PageLibrary = PageLibrary;
window.ImportDrawer = ImportDrawer;
