/* global React, ReactDOM, PageLibrary, ImportDrawer, DetailDrawer, I, LI, PageHead, Annot, Tag */
/* global useTweaks, TweaksPanel, TweakSection, TweakColor, TweakRadio, TweakSelect */

const { LIB } = window;

const LIB_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#c14a1b",
  "theme": "light",
  "startView": "default"
}/*EDITMODE-END*/;

// ---------- Custom nav with Library highlighted ----------
function LibAppNav({ view, setView }) {
  const items = [
    { key: "studio",   label: "Studio" },
    { key: "memory",   label: "Memory" },
    { key: "queue",    label: "Queue", badge: 5 },
    { key: "library",  label: "Library", isThis: true },
    { key: "settings", label: "Settings" },
  ];
  return (
    <div className="app-nav">
      <div className="container app-nav-inner">
        <a className="brand" href="dashboard.html">
          <span className="brand-mark">bbc</span>
          <span>bbc</span>
          <span className="brand-word">big brain company</span>
        </a>
        <button className="app-workspace" type="button">
          <span className="ws-dot" />
          <span className="ws-name">acme</span>
          <span className="mono" style={{color:"var(--muted)"}}>/ team</span>
          <span className="ws-caret">▾</span>
        </button>
        <nav className="app-routes" aria-label="primary">
          {items.map(it => (
            <a
              key={it.key}
              className={`app-route ${it.isThis ? "is-active" : ""}`}
              href={it.isThis ? "#" : "dashboard.html"}
              onClick={(e) => { if (it.isThis) e.preventDefault(); }}
            >
              {it.label}
              {it.badge ? <span className="badge">{it.badge}</span> : null}
            </a>
          ))}
        </nav>
        <div className="app-nav-right">
          <div className="app-search">
            <span className="placeholder">search library…</span>
            <span className="kbd">⌘K</span>
          </div>
          <div className="app-avatar" title="priya">P</div>
          <button className="app-nav-burger" aria-label="menu"><I.burger /></button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MOBILE-PREVIEW VIEW
// ============================================================
function MobilePreview({ onOpen }) {
  return (
    <div className="container page">
      <PageHead
        crumb={<><a href="#">acme</a><span className="sep">/</span><span className="current">library</span><span className="sep">/</span><span className="current">mobile</span></>}
        title={<>Mobile <span className="serif">breakpoints</span>.</>}
        blurb="Same surface, two device-class views. Card grid collapses to one column at 540px. The recommended band becomes a horizontal scroller. Detail surface is a full-screen sheet, not a side drawer hidden behind the nav."
      />

      <div className="device-wrap">
        <div>
          <div className="device-frame">
            <div className="notch" />
            <div className="device-screen">
              <div className="scroller">
                {/* mini header */}
                <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", paddingBottom: 8, borderBottom:"1px solid var(--rule)"}}>
                  <div>
                    <div style={{fontFamily:"Geist Mono", fontSize: 10, color:"var(--muted)"}}>acme / library</div>
                    <div style={{fontFamily:"Geist", fontSize: 22, fontWeight: 500, letterSpacing:"-0.02em", marginTop: 2}}>Library.</div>
                  </div>
                  <button className="btn btn-ghost" style={{height: 26, fontSize: 11, padding: "0 8px"}}>import</button>
                </div>
                {/* tabs */}
                <div className="tabs" style={{padding: 2}}>
                  <button>Overview</button>
                  <button className="is-active">Skills</button>
                  <button>Conn.</button>
                  <button>Prov.</button>
                </div>
                {/* mini search */}
                <div className="lib-search" style={{height: 32}}>
                  <span className="lib-search-ic"><LI.search /></span>
                  <span style={{flex: 1, fontFamily:"Geist", fontSize: 12, color:"var(--muted-2)"}}>search…</span>
                </div>
                {/* mini rec-row — horizontal scroll */}
                <div style={{display:"flex", gap: 8, overflowX:"auto", margin:"0 -12px", padding:"0 12px"}}>
                  {[LIB.SKILLS.find(s=>s.id==="sk_003"), LIB.SKILLS.find(s=>s.id==="sk_005")].map(s => (
                    <div key={s.id} style={{flex:"0 0 76%", scrollSnapAlign:"start"}}>
                      <MiniCard item={s} kind="skill" />
                    </div>
                  ))}
                </div>
                {/* chips */}
                <div style={{display:"flex", gap: 4, flexWrap:"wrap"}}>
                  {["all","marketing","engineering","founder"].map(c => (
                    <span key={c} className="lib-chip" style={c==="marketing"?{background:"var(--ink)", color:"var(--bg)", borderColor:"var(--ink)"}:null}>
                      {c==="marketing" && <span style={{width:5,height:5,borderRadius:"50%",background:"var(--bg)",display:"inline-block",marginRight:4}}/>}
                      {c}
                    </span>
                  ))}
                </div>
                {/* mini cards */}
                {LIB.SKILLS.filter(s => s.role === "marketing").slice(0, 3).map(s => (
                  <MiniCard key={s.id} item={s} kind="skill" />
                ))}
              </div>
            </div>
          </div>
          <div className="device-label">/library/skills · default</div>
        </div>

        <div>
          <div className="device-frame">
            <div className="notch" />
            <div className="device-screen">
              <div className="scroller">
                {/* full-screen sheet (back at top) */}
                <div style={{display:"flex", alignItems:"center", gap: 10}}>
                  <button style={{width:28, height:28, border:"1px solid var(--rule)", borderRadius:6, background:"var(--paper)", display:"grid", placeItems:"center"}}><I.x /></button>
                  <div style={{fontFamily:"Geist Mono", fontSize: 11, color:"var(--muted)", flex: 1}}>library / skills</div>
                </div>
                <div style={{display:"flex", alignItems:"center", gap: 12, marginTop: 4}}>
                  <div className="glyph-lg" style={{width: 46, height: 46, borderRadius: 10, background:"color-mix(in oklab, var(--t-skill), transparent 85%)", color:"var(--t-skill)", display:"grid", placeItems:"center", fontFamily:"Geist Mono", fontSize: 18, fontWeight: 600, border:"1px solid color-mix(in oklab, var(--t-skill), transparent 70%)"}}>F</div>
                  <div>
                    <div style={{fontFamily:"Geist", fontSize: 18, fontWeight: 500, letterSpacing:"-0.02em"}}>Weekly investor recap</div>
                    <div style={{fontFamily:"Geist Mono", fontSize: 10.5, color:"var(--muted)", marginTop: 2}}>by BBC · founder · AGPL-3.0</div>
                  </div>
                </div>
                <p style={{fontSize: 12.5, color:"var(--ink-2)", lineHeight: 1.5, margin: "8px 0 0", textWrap:"pretty"}}>
                  Reads the week's accepted memory and drafts a 3-section investor update — wins, risks, asks.
                </p>
                <div style={{display:"flex", flexWrap:"wrap", gap: 4, paddingTop: 10, marginTop: 10, borderTop:"1px solid var(--rule)"}}>
                  <span className="schema-chip" style={{"--tag-color":"var(--t-decision)"}}><span className="dot"/>decision</span>
                  <span className="schema-chip" style={{"--tag-color":"var(--t-team)"}}><span className="dot"/>team</span>
                  <span className="schema-chip" style={{"--tag-color":"var(--t-product)"}}><span className="dot"/>product</span>
                  <span className="schema-chip" style={{"--tag-color":"var(--t-vendor)"}}><span className="dot"/>vendor</span>
                </div>
                <div style={{display:"flex", flexDirection:"column", gap: 8, paddingTop: 12, marginTop: 12, borderTop:"1px solid var(--rule)"}}>
                  <div style={{fontFamily:"Geist Mono", fontSize: 10.5, color:"var(--muted)", textTransform:"lowercase", letterSpacing:"0.04em"}}>first-use inputs · 2 fields</div>
                  <div style={{border:"1px solid var(--rule)", borderRadius: 6, background:"var(--paper)", padding:"8px 10px", display:"flex", flexDirection:"column", gap: 6, fontFamily:"Geist Mono", fontSize: 11}}>
                    <div><span style={{color:"var(--muted-2)"}}>01</span> <span style={{color:"var(--ink)"}}>weekStart</span></div>
                    <div><span style={{color:"var(--muted-2)"}}>02</span> <span style={{color:"var(--ink)"}}>tone</span></div>
                  </div>
                </div>
                <div style={{display:"flex", flexDirection:"column", gap: 4, paddingTop: 12, marginTop: 12, borderTop:"1px solid var(--rule)"}}>
                  <div style={{fontFamily:"Geist Mono", fontSize: 10.5, color:"var(--muted)", textTransform:"lowercase", letterSpacing:"0.04em"}}>provenance</div>
                  <div style={{fontFamily:"Geist Mono", fontSize: 11, color:"var(--ink-2)"}}>github.com/bbc-org/skills/founder-weekly-recap</div>
                  <div style={{fontFamily:"Geist Mono", fontSize: 11, color:"var(--muted)"}}>updated 2026-05-01 · ★ 96</div>
                </div>
                <div style={{marginTop: "auto"}}>
                  <button className="btn btn-primary btn-lg" style={{width:"100%", justifyContent:"center", marginTop: 16}}>install skill</button>
                </div>
              </div>
            </div>
          </div>
          <div className="device-label">/library/skills/sk_003 · full-screen sheet</div>
        </div>
      </div>

      <Annot
        rationale={`On mobile we don't put the detail surface in a side drawer — there is no side. The detail becomes a full-screen sheet with its own back button, so the user always knows how to return. The card grid collapses to one column at 540px, and the recommended band switches from auto-fit grid to a horizontal scroll-snap row, mirroring how Notion and Slack handle their marketplace landings on small screens.`}
        primitives={`Reuses <code>.lib-card</code>, <code>.lib-chip</code>, <code>.lib-search</code>, <code>.schema-chip</code>. The device frames are scoped via <code>.device-frame</code> / <code>.device-screen</code> · they exist to preview the responsive surface, not to ship.`}
      />
    </div>
  );
}

function MiniCard({ item, kind }) {
  const roleColor = kind === "skill" ? LIB.ROLE_COLOR[item.role] : "var(--t-source_artifact)";
  return (
    <div className="lib-card" style={{ "--role-color": roleColor, padding: "12px 12px 10px", gridTemplateColumns: "30px 1fr" }}>
      {item.badge && <span className={`corner ${item.badge}`} style={{top: 8, right: 8, fontSize: 9, padding: "1px 6px"}}>{item.badge}</span>}
      <div className="glyph" style={{width: 30, height: 30, fontSize: 11}}>{item.glyph}</div>
      <div className="head">
        <div className="nm" style={{fontSize: 12.5}}>{item.name}</div>
        <div className="by" style={{fontSize: 10}}>by {item.author}</div>
      </div>
      <p className="desc" style={{fontSize: 11, margin: "4px 0 8px", lineHeight: 1.4, gridColumn: 2}}>{item.desc.slice(0, 70)}…</p>
      <div className="schema" style={{gridColumn: 2, marginBottom: 8, gap: 3}}>
        {(kind === "skill" ? item.reads : item.writes).slice(0,3).map(r => (
          <span key={r} className="schema-chip" style={{"--tag-color":`var(--t-${r === "any (mapped)" ? "source_artifact" : r})`, fontSize: 9.5, padding: "1px 5px"}}><span className="dot" style={{width:4, height:4}}/>{r}</span>
        ))}
      </div>
      <div className="foot" style={{padding: 0, borderTop: "none"}}>
        <span className="meta" style={{fontSize: 10}}>{item.license}</span>
        <button className="install" style={{height: 22, padding: "0 8px", fontSize: 10.5}}>install</button>
      </div>
    </div>
  );
}

// ============================================================
// IA / OVERVIEW PAGE (designer's reasoning, first-load)
// ============================================================
function PageIA({ setView }) {
  return (
    <div className="container-narrow page">
      <PageHead
        crumb={<><a href="#">acme</a><span className="sep">/</span><span className="current">library</span><span className="sep">/</span><span className="current">design notes</span></>}
        title={<>The <span className="serif">library</span>, in shape.</>}
        blurb="A note from the designer before the screens themselves. Audience, IA, and the choices made under the hood — so you know what you're looking at as you flip through the tweaks."
        actions={<button className="btn btn-primary btn-lg" onClick={()=>setView("default")}>open the library →</button>}
      />

      <div className="ia-sketch">
        <div className="ia-nav-demo">
          <div className="lab">
            <span>info-architecture · /library</span>
            <span>tabs over routes · one URL, four views</span>
          </div>
          <div className="ia-nav-bar">
            <span className="item is-active">Overview</span>
            <span className="item">Skills <span className="pill muted">12</span></span>
            <span className="item">Connectors <span className="pill muted">9</span></span>
            <span className="item">Providers <span className="pill muted">8</span></span>
            <span className="spacer" />
            <span className="item" style={{color:"var(--accent)"}}>+ import from URL</span>
          </div>
        </div>

        <div className="ia-map">
          <div className="ia-map-card">
            <div className="h"><div className="n">1</div><div className="name">Skills</div></div>
            <p style={{fontSize:13, color:"var(--muted)", margin:"0 0 10px", lineHeight: 1.5}}>Role templates — what a studio does.</p>
            <ul>
              <li><span className="arrow">→</span> filter by role · marketing, engineering, founder, designer, support…</li>
              <li><span className="arrow">→</span> import from URL is a primary action here</li>
              <li><span className="arrow">→</span> firstUseInputs preview in detail drawer</li>
            </ul>
          </div>
          <div className="ia-map-card">
            <div className="h"><div className="n">2</div><div className="name">Connectors</div></div>
            <p style={{fontSize:13, color:"var(--muted)", margin:"0 0 10px", lineHeight: 1.5}}>External sources → typed memory.</p>
            <ul>
              <li><span className="arrow">→</span> filter by source · docs, code, chat, tasks, email, files, webhook</li>
              <li><span className="arrow">→</span> scopes preview · split between "will read / will not access"</li>
              <li><span className="arrow">→</span> install = OAuth + first sync · shown as installing banner</li>
            </ul>
          </div>
          <div className="ia-map-card">
            <div className="h"><div className="n">3</div><div className="name">Providers</div></div>
            <p style={{fontSize:13, color:"var(--muted)", margin:"0 0 10px", lineHeight: 1.5}}>Vendor adapters · LLM, DB, email, hosting.</p>
            <ul>
              <li><span className="arrow">→</span> filter by role · llm / db / email / hosting / analytics</li>
              <li><span className="arrow">→</span> connection state · env key · last test · configure-link in detail</li>
              <li><span className="arrow">→</span> no typed-schema mapping · just provider role</li>
            </ul>
          </div>
        </div>

        <Annot
          rationale={`Two users, one page. The default '/library' surface leads with curated content: a recommended band sourced from role + memory-gap detection, then a slice of each category for browsing. Power-user mechanics (search, filter chips, installed-only toggle, the URL importer) live one tab down — discoverable in 1 click, but not visually loud on first load. This is the 'information-density gradient' the brief asks for, expressed as scroll depth rather than a beginner/advanced toggle.`}
          primitives={`Tabs over routes — one URL, four views — so the back button on detail dismisses to the right tab. Detail surface is a side drawer on desktop, a full-screen sheet on mobile · provenance + schema + license is the killer-feature surface. Import-from-URL is a side drawer too · sharing its chrome with detail keeps the cognitive load down.`}
        />
      </div>
    </div>
  );
}

// ============================================================
// APP
// ============================================================
function App() {
  const [t, setTweak] = useTweaks(LIB_TWEAK_DEFAULTS);
  const [view, setView]             = React.useState(t.startView);     // ia | default | skills | connectors | providers | empty | installing | error | search | mobile | detail-skill | detail-connector | detail-provider | import | import-flagged
  const [detailOpen, setDetailOpen] = React.useState(null);
  const [importOpen, setImportOpen] = React.useState(false);
  const [importFlagged, setImportFlagged] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", t.theme);
    document.documentElement.style.setProperty("--accent", t.accent);
  }, [t.theme, t.accent]);

  React.useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [view]);

  // ---------- view-derived state ----------
  // The drawer auto-opens for detail-* views (so the user lands on the drawer-open state).
  React.useEffect(() => {
    if (view === "detail-skill")     setDetailOpen({ item: LIB.SKILLS.find(s => s.id === "sk_001"),     kind: "skill" });
    else if (view === "detail-connector") setDetailOpen({ item: LIB.CONNECTORS.find(c => c.id === "co_003"), kind: "connector" });
    else if (view === "detail-provider")  setDetailOpen({ item: LIB.PROVIDERS.find(p => p.id === "pr_003"),  kind: "provider" });
    else if (view === "import")          { setImportOpen(true); setImportFlagged(false); }
    else if (view === "import-flagged")  { setImportOpen(true); setImportFlagged(true); }
    else {
      setDetailOpen(null);
      setImportOpen(false);
      setImportFlagged(false);
    }
  }, [view]);

  // ---------- compute tab + state for the page ----------
  let activeTab = "default";
  let pageState = "default";
  if (view === "skills"     || view === "detail-skill")     activeTab = "skills";
  if (view === "connectors" || view === "detail-connector") activeTab = "connectors";
  if (view === "providers"  || view === "detail-provider")  activeTab = "providers";
  if (view === "installing") { activeTab = "connectors"; pageState = "installing"; }
  if (view === "error")      { activeTab = "connectors"; pageState = "error"; }
  if (view === "search")     { activeTab = "skills"; pageState = "search"; }
  if (view === "empty")      pageState = "empty";

  // sub-tab navigation from within the library page
  const setTab = (k) => {
    setView(k); // tab key maps 1:1 to view
  };

  return (
    <>
      <LibAppNav view={view} setView={setView} />
      <main>
        {view === "ia" && <PageIA setView={setView} />}
        {view === "mobile" && <MobilePreview onOpen={(it, k) => setDetailOpen({ item: it, kind: k })} />}
        {["default","skills","connectors","providers","empty","installing","error","search","detail-skill","detail-connector","detail-provider","import","import-flagged"].includes(view) && (
          <PageLibrary
            tab={activeTab}
            setTab={setTab}
            state={pageState}
            detailOpen={detailOpen}
            setDetail={setDetailOpen}
            importOpen={importOpen}
            setImportOpen={setImportOpen}
            importFlagged={importFlagged}
          />
        )}
      </main>

      {detailOpen && (
        <DetailDrawer
          item={detailOpen.item}
          kind={detailOpen.kind}
          installingId={null}
          onClose={() => { setDetailOpen(null); if (view.startsWith("detail-")) setView(activeTab); }}
          onInstall={() => {}}
        />
      )}
      {importOpen && (
        <ImportDrawer
          flaggedDefault={importFlagged}
          onClose={() => { setImportOpen(false); if (view === "import" || view === "import-flagged") setView("skills"); }}
        />
      )}

      <TweaksPanel title="Tweaks">
        <TweakSection title="screen">
          <TweakSelect
            label="view"
            value={view}
            onChange={(v) => setView(v)}
            options={[
              { value: "ia",                 label: "00 · design notes" },
              { value: "default",            label: "01 · /library · overview" },
              { value: "skills",             label: "02 · /library/skills" },
              { value: "connectors",         label: "03 · /library/connectors" },
              { value: "providers",          label: "04 · /library/providers" },
              { value: "detail-skill",       label: "05a · detail · skill" },
              { value: "detail-connector",   label: "05b · detail · connector" },
              { value: "detail-provider",    label: "05c · detail · provider" },
              { value: "import",             label: "06a · import from URL" },
              { value: "import-flagged",     label: "06b · import · flagged" },
              { value: "empty",              label: "07 · empty tenant" },
              { value: "installing",         label: "08a · installing state" },
              { value: "error",              label: "08b · error state" },
              { value: "search",             label: "09 · search results" },
              { value: "mobile",             label: "10 · mobile breakpoints" },
            ]}
          />
        </TweakSection>
        <TweakSection title="palette">
          <TweakColor
            label="accent"
            value={t.accent}
            onChange={(v) => setTweak("accent", v)}
            options={["#c14a1b", "#2b5ec9", "#2f7a3d", "#6f3bb8", "#15140f"]}
          />
          <TweakRadio
            label="theme"
            value={t.theme}
            onChange={(v) => setTweak("theme", v)}
            options={[{ value: "light", label: "paper" }, { value: "dark", label: "ink" }]}
          />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
