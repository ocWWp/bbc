/* global React, I, Tag */

const { LIB } = window;

// ---------- icons additions ----------
const LI = {
  search: () => <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="4"/><line x1="9" y1="9" x2="12" y2="12"/></svg>,
  github: () => <svg viewBox="0 0 14 14" width="13" height="13" fill="currentColor"><path d="M7 0.5a6.5 6.5 0 0 0-2.05 12.66c.32.06.44-.14.44-.31v-1.13c-1.8.39-2.18-.86-2.18-.86-.3-.74-.72-.94-.72-.94-.58-.4.05-.39.05-.39.64.04.98.66.98.66.57.98 1.5.7 1.87.53.06-.42.22-.7.4-.86-1.44-.16-2.96-.72-2.96-3.2 0-.71.25-1.29.66-1.74-.07-.16-.29-.83.06-1.72 0 0 .55-.18 1.8.66a6.27 6.27 0 0 1 3.27 0c1.25-.84 1.8-.66 1.8-.66.36.9.13 1.56.06 1.72.41.45.66 1.03.66 1.74 0 2.48-1.52 3.03-2.96 3.2.23.2.44.6.44 1.2v1.78c0 .17.12.38.45.31A6.5 6.5 0 0 0 7 0.5z"/></svg>,
  link: () => <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8.5l-1 1a2.12 2.12 0 1 1-3-3l2-2a2.12 2.12 0 0 1 3 0"/><path d="M8 5.5l1-1a2.12 2.12 0 1 1 3 3l-2 2a2.12 2.12 0 0 1-3 0"/></svg>,
  warn: () => <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 1.5L13 12H1z"/><line x1="7" y1="6" x2="7" y2="9"/><circle cx="7" cy="10.5" r="0.6" fill="currentColor"/></svg>,
  check: () => <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5,7.5 5.5,10.5 11.5,4"/></svg>,
  x: () => <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></svg>,
  open: () => <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h3v3"/><line x1="11" y1="3" x2="6.5" y2="7.5"/><path d="M11 8v3h-8v-8h3"/></svg>,
};

// ---------- supertag chip (read/write direction) ----------
function SchemaChip({ name, direction }) {
  return (
    <span className="schema-chip" style={{ "--tag-color": `var(--t-${name})` }}>
      <span className="dot" />
      {direction && <span className="direction">{direction}</span>}
      {name}
    </span>
  );
}

// ---------- skill / connector / provider card ----------
function LibCard({ item, kind, focused, installingId, onOpen, onInstall }) {
  const roleColor = kind === "skill"
    ? LIB.ROLE_COLOR[item.role] || "var(--ink)"
    : kind === "connector"
      ? "var(--t-source_artifact)"
      : "var(--ink)";

  const installed = kind === "provider" ? item.connected : item.installed;
  const installing = installingId === item.id;

  return (
    <div
      className={`lib-card ${focused ? "is-focused" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item, kind)}
      style={{ "--role-color": roleColor }}
    >
      {item.badge && (
        <span className={`corner ${item.badge}`}>{item.badge}</span>
      )}
      <div className="glyph">{item.glyph}</div>
      <div className="head">
        <div className="nm">{item.name}</div>
        <div className="by">
          By <span className="bb">{item.author}</span>
          {kind === "skill" && <> · <span>{item.role}</span></>}
          {kind === "connector" && <> · <span>{item.source}</span></>}
          {kind === "provider" && <> · <span>role: {item.role}</span></>}
        </div>
      </div>

      <p className="desc">{item.desc}</p>

      {/* schema mapping */}
      <div className="schema">
        {kind === "skill" && (
          <>
            <span className="lab">reads:</span>
            {item.reads.map(r => <SchemaChip key={"r"+r} name={r} />)}
            {item.writes && item.writes.length > 0 && (
              <>
                <span className="lab" style={{marginLeft: 4}}>writes:</span>
                {item.writes.map(w => <SchemaChip key={"w"+w} name={w} />)}
              </>
            )}
          </>
        )}
        {kind === "connector" && (
          <>
            <span className="lab">writes:</span>
            {item.writes.map(w => (
              w === "any (mapped)"
                ? <span key={w} className="schema-chip" style={{"--tag-color":"var(--muted)"}}><span className="dot" />{w}</span>
                : <SchemaChip key={w} name={w} />
            ))}
          </>
        )}
        {kind === "provider" && (
          <span className="schema-chip" style={{"--tag-color":"var(--ink)"}}>
            <span className="dot" />role · {item.role}-provider
          </span>
        )}
      </div>

      <div className="foot">
        <div className="meta">
          {kind === "skill" && (<>
            <span>{item.license}</span>
            <span className="sep">·</span>
            <span>★ {item.stars}</span>
          </>)}
          {kind === "connector" && (<>
            <span>{item.license}</span>
            <span className="sep">·</span>
            <span>src · {item.source}</span>
          </>)}
          {kind === "provider" && (<>
            <span>env · {item.env}</span>
          </>)}
        </div>
        <button
          className={`install ${installed ? "is-installed" : ""} ${installing ? "is-installing" : ""}`}
          onClick={(e) => { e.stopPropagation(); onInstall(item, kind); }}
          aria-label={`${installed ? "Open" : "Install"} ${item.name}`}
        >
          {installing
            ? <><span className="lib-spinner" /> installing…</>
            : installed
              ? <><LI.check /> {kind === "provider" ? "connected" : "installed"}</>
              : <>install</>
          }
        </button>
      </div>
    </div>
  );
}

// ---------- recommended card (in band) ----------
function RecCard({ item, kind, onOpen, onInstall }) {
  const roleColor = kind === "skill"
    ? LIB.ROLE_COLOR[item.role] || "var(--accent)"
    : kind === "connector" ? "var(--t-source_artifact)" : "var(--accent)";
  const why = item.why || (
    kind === "skill"
      ? `Detected ${item.role} role · no skill installed there yet.`
      : kind === "connector"
        ? `You have ${item.writes && item.writes.join("/")} memory but no ${item.source} source.`
        : `Default provider role.`
  );
  return (
    <div className="rec-card" style={{ "--role-color": roleColor }} onClick={() => onOpen(item, kind)}>
      <div className="glyph">{item.glyph}</div>
      <div>
        <div className="nm">
          {item.name}
          <span className="kind">· {kind}</span>
        </div>
      </div>
      <div className="why-line">
        <strong>Why this?</strong> {why}
      </div>
      <div className="foot">
        <span className="by mono" style={{fontSize: 11, color:"var(--muted)"}}>by {item.author}</span>
        <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); onInstall(item, kind); }}>install</button>
      </div>
    </div>
  );
}

// ---------- DETAIL DRAWER ----------
function DetailDrawer({ item, kind, onClose, onInstall, installingId }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!item) return null;
  const roleColor = kind === "skill"
    ? LIB.ROLE_COLOR[item.role] || "var(--ink)"
    : kind === "connector" ? "var(--t-source_artifact)" : "var(--ink)";
  const installed = kind === "provider" ? item.connected : item.installed;
  const installing = installingId === item.id;

  // sample firstUseInputs for the skill detail
  const firstUseInputs = kind === "skill" ? (
    item.role === "marketing" ? [
      { k: "launchProductName", desc: "string — the product or feature you're announcing" },
      { k: "targetAudience",    desc: "string — who this is for (e.g. 'B2B SaaS founders')" },
      { k: "channels",          desc: "list — subset of [x, linkedin, threads]" },
    ] : item.role === "founder" ? [
      { k: "weekStart",   desc: "iso date — the Monday of the recap window" },
      { k: "tone",        desc: "string — 'matter-of-fact' | 'warm' | 'investor-formal'" },
    ] : item.role === "engineering" ? [
      { k: "incidentId",  desc: "string — the run id of the on-call session" },
      { k: "scope",       desc: "list — affected services" },
    ] : [
      { k: "topic",       desc: "string — what this run is about" },
      { k: "audience",    desc: "string — who reads the output" },
    ]
  ) : null;

  return (
    <>
      <div className="lib-drawer-scrim" onClick={onClose} />
      <aside className="lib-drawer" role="dialog" aria-label={`${item.name} details`}>
        <div className="lib-drawer-head">
          <div className="crumb">
            library / <strong>{kind === "skill" ? "skills" : kind === "connector" ? "connectors" : "providers"}</strong> / {item.id}
          </div>
          <button className="close" onClick={onClose} aria-label="Close">
            <I.x />
          </button>
        </div>

        <div className="lib-drawer-body">
          <div className="hero-card" style={{ "--role-color": roleColor }}>
            <div className="glyph-lg">{item.glyph}</div>
            <div>
              <h2>{item.name}</h2>
              <div className="sub">
                <span>by {item.author}</span>
                <span className="sep">·</span>
                {kind === "skill" && <><span>role · {item.role}</span><span className="sep">·</span></>}
                {kind === "connector" && <><span>source · {item.source}</span><span className="sep">·</span></>}
                {kind === "provider" && <><span>role · {item.role}-provider</span><span className="sep">·</span></>}
                <span>{item.license}</span>
              </div>
            </div>
          </div>

          <p className="lede">{item.desc}{" "}
            {kind === "skill" && "When a studio runs this skill, BBC pulls the read-set from memory, asks for the first-use inputs once, and files outputs back to /queue for review. Every claim is cited."}
            {kind === "connector" && "BBC opens the OAuth flow inside Settings, syncs the first batch, and files proposals to /queue rather than writing memory directly. You review before anything lands."}
            {kind === "provider" && "Providers are vendor adapters. Once connected, individual studios can be bound to this provider in /settings/bindings."}
          </p>

          {/* schema mapping — large */}
          <div className="lib-section">
            <div className="lab"><span>typed-schema mapping</span></div>
            <div className="schema" style={{display:"flex", flexWrap:"wrap", gap:6}}>
              {kind === "skill" && (
                <>
                  <span className="lab" style={{fontFamily:"Geist Mono, monospace", fontSize:11, color:"var(--muted)"}}>reads:</span>
                  {item.reads.map(r => <SchemaChip key={"r"+r} name={r} />)}
                  <span style={{flexBasis:"100%", height:0}}></span>
                  <span className="lab" style={{fontFamily:"Geist Mono, monospace", fontSize:11, color:"var(--muted)"}}>writes:</span>
                  {(item.writes||[]).map(w => <SchemaChip key={"w"+w} name={w} />)}
                  {(!item.writes || item.writes.length === 0) && <span className="schema-chip" style={{"--tag-color":"var(--muted)"}}><span className="dot"/>none</span>}
                </>
              )}
              {kind === "connector" && (<>
                <span className="lab" style={{fontFamily:"Geist Mono, monospace", fontSize:11, color:"var(--muted)"}}>writes:</span>
                {item.writes.map(w => (
                  w === "any (mapped)"
                    ? <span key={w} className="schema-chip" style={{"--tag-color":"var(--muted)"}}><span className="dot" />{w}</span>
                    : <SchemaChip key={w} name={w} />
                ))}
              </>)}
              {kind === "provider" && (
                <span className="schema-chip" style={{"--tag-color":"var(--ink)"}}>
                  <span className="dot" />role · {item.role}-provider
                </span>
              )}
            </div>
          </div>

          {/* skill: firstUseInputs */}
          {kind === "skill" && (
            <div className="lib-section">
              <div className="lab">
                <span>first-use inputs · asked at run time</span>
                <span className="mono" style={{fontSize:10.5, color:"var(--muted-2)"}}>{firstUseInputs.length} fields</span>
              </div>
              <ul className="lib-inputs">
                {firstUseInputs.map((f, i) => (
                  <li key={f.k}>
                    <span className="n">{(i+1).toString().padStart(2,"0")}</span>
                    <span className="k">{f.k}</span>
                    <span className="desc">{f.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* connector: scopes preview */}
          {kind === "connector" && (
            <div className="lib-section">
              <div className="lab">
                <span>oauth permissions preview</span>
                <span className="mono" style={{fontSize:10.5, color:"var(--muted-2)"}}>before you install</span>
              </div>
              <div className="lib-scope">
                <div className="col allow">
                  <div className="h"><LI.check /> will read</div>
                  <ul>{item.scopes_yes.map(s => <li key={s}>{s}</li>)}</ul>
                </div>
                <div className="col deny">
                  <div className="h"><LI.x /> will not access</div>
                  <ul>{item.scopes_no.map(s => <li key={s}>{s}</li>)}</ul>
                </div>
              </div>
            </div>
          )}

          {/* provider: connection state */}
          {kind === "provider" && (
            <div className="lib-section">
              <div className="lab"><span>connection state</span></div>
              <div className="lib-kv">
                <span className="k">status</span>
                <span className="v">
                  {item.connected
                    ? <span className="pill ok"><span className="dot" /> connected</span>
                    : <span className="pill muted"><span className="dot" /> not connected</span>}
                </span>
                <span className="k">env key</span>
                <span className="v"><code>{item.env}</code></span>
                <span className="k">last test</span>
                <span className="v">{item.lastTest}</span>
                <span className="k">configure</span>
                <span className="v"><a href="#">settings / keys / {item.name.toLowerCase()}</a></span>
              </div>
            </div>
          )}

          {/* metadata / provenance */}
          {(kind !== "provider") && (
            <div className="lib-section">
              <div className="lab"><span>provenance</span></div>
              <div className="lib-kv">
                <span className="k">repo</span>
                <span className="v"><a href={"https://" + item.repo} target="_blank" rel="noreferrer"><LI.github /> {item.repo} <LI.open /></a></span>
                <span className="k">license</span>
                <span className="v"><code>{item.license}</code></span>
                {kind === "skill" && <>
                  <span className="k">last updated</span>
                  <span className="v">{item.updated}</span>
                  <span className="k">stars</span>
                  <span className="v">★ {item.stars}</span>
                </>}
              </div>
            </div>
          )}
        </div>

        <div className="lib-drawer-foot">
          <div className="left">
            {installed
              ? <>currently installed · last used <strong>2h ago</strong></>
              : kind === "provider" ? <>requires <strong>{item.env}</strong> in /settings/keys</> : <>installing files this to <strong>/library/{kind}s/{item.id}</strong></>
            }
          </div>
          {installed && kind === "skill" && <button className="btn btn-ghost">open in studio →</button>}
          {installed && kind === "connector" && <button className="btn btn-ghost">open settings →</button>}
          <button
            className={`btn btn-primary btn-lg ${installing ? "" : ""}`}
            onClick={() => onInstall(item, kind)}
            aria-label={`${installed ? "Uninstall" : "Install"} ${item.name}`}
            style={installed ? {background:"transparent", color:"var(--ink)", border:"1px solid var(--rule-2)"} : null}
          >
            {installing
              ? <><span className="lib-spinner" /> installing…</>
              : installed
                ? (kind === "provider" ? "disconnect" : "uninstall")
                : (kind === "provider" ? "connect" : "install")}
          </button>
        </div>
      </aside>
    </>
  );
}

window.LibCard = LibCard;
window.RecCard = RecCard;
window.DetailDrawer = DetailDrawer;
window.SchemaChip = SchemaChip;
window.LI = LI;
