"use client";

import { useEffect } from "react";
import type { CSSProperties } from "react";
import type {
  LibItem,
  SkillItem,
  ConnectorItem,
  ProviderItem,
  SkillRole,
} from "../_data";
import { ROLE_COLOR } from "../_data";
import { Icons } from "./Icons";
import { SchemaChip, relativeTime } from "./Cards";
import { BrandIcon, hasBrandIcon } from "./BrandIcon";

function isSkill(item: LibItem): item is SkillItem {
  return item.kind === "skill";
}
function isConnector(item: LibItem): item is ConnectorItem {
  return item.kind === "connector";
}
function isProvider(item: LibItem): item is ProviderItem {
  return item.kind === "provider";
}

const FIRST_USE_INPUTS_BY_ROLE: Record<SkillRole, { k: string; desc: string }[]> = {
  marketing: [
    { k: "launchProductName", desc: "string — the product or feature you're announcing" },
    { k: "targetAudience", desc: "string — who this is for (e.g. 'B2B SaaS founders')" },
    { k: "channels", desc: "list — subset of [x, linkedin, threads]" },
  ],
  founder: [
    { k: "weekStart", desc: "iso date — the Monday of the recap window" },
    { k: "tone", desc: "string — 'matter-of-fact' | 'warm' | 'investor-formal'" },
  ],
  engineering: [
    { k: "incidentId", desc: "string — the run id of the on-call session" },
    { k: "scope", desc: "list — affected services" },
  ],
  designer: [
    { k: "topic", desc: "string — what this run is about" },
    { k: "audience", desc: "string — who reads the output" },
  ],
  support: [
    { k: "topic", desc: "string — what this run is about" },
    { k: "audience", desc: "string — who reads the output" },
  ],
  sales: [
    { k: "topic", desc: "string — what this run is about" },
    { k: "audience", desc: "string — who reads the output" },
  ],
  ops: [
    { k: "topic", desc: "string — what this run is about" },
    { k: "audience", desc: "string — who reads the output" },
  ],
  meta: [
    { k: "topic", desc: "string — what this run is about" },
    { k: "audience", desc: "string — who reads the output" },
  ],
};

type RoleColorStyle = CSSProperties & { "--role-color"?: string };
type TagColorStyle = CSSProperties & { "--tag-color"?: string };

export type DetailDrawerProps = {
  item: LibItem;
  installingId?: string | null;
  onClose: () => void;
  onInstall: (item: LibItem) => void;
  /** When false (current v1.7 default), install/uninstall CTAs are hidden.
   *  The drawer remains a useful catalog detail view. */
  installEnabled?: boolean;
  /** Phase K codex P2: install routes require admin. Non-admins see the
   *  catalog detail but no install CTA. */
  isAdmin?: boolean;
};

export function DetailDrawer({ item, installingId, onClose, onInstall, installEnabled = false, isAdmin = false }: DetailDrawerProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const roleColor = isSkill(item)
    ? ROLE_COLOR[item.role] ?? "var(--ink)"
    : isConnector(item)
      ? "var(--t-source_artifact)"
      : "var(--ink)";
  const style: RoleColorStyle = { "--role-color": roleColor };

  const installed = isProvider(item) ? item.connected : item.installed;
  const installing = installingId === item.id;
  // Phase K T17/T19: connectors with their own install_url enable the
  // install CTA regardless of the page-level installEnabled flag. Admin-only
  // (codex P2 post-K.5) — the install routes themselves require admin.
  const effectiveInstallEnabled =
    installEnabled || (isAdmin && isConnector(item) && Boolean(item.install_url));
  // T19: installed connectors with a last_sync_at surface the time so the
  // operator can decide whether to reinstall (e.g., to rotate credentials)
  // without leaving the drawer.
  const installedHint =
    isConnector(item) && item.installed && item.last_sync_at
      ? `installed · last synced ${relativeTime(item.last_sync_at)}`
      : null;

  const firstUseInputs = isSkill(item) ? FIRST_USE_INPUTS_BY_ROLE[item.role] : null;
  const kindWord = isSkill(item) ? "skills" : isConnector(item) ? "connectors" : "providers";

  return (
    <>
      <div className="lib-drawer-scrim" onClick={onClose} />
      <aside className="lib-drawer" role="dialog" aria-label={`${item.name} details`}>
        <div className="lib-drawer-head">
          <div className="crumb">
            library / <strong>{kindWord}</strong> / {item.id}
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="Close">
            <Icons.x />
          </button>
        </div>

        <div className="lib-drawer-body">
          <div className="hero-card" style={style}>
            <div className="glyph-lg">
              {hasBrandIcon(item.name) ? (
                <BrandIcon name={item.name} size={28} />
              ) : (
                item.glyph
              )}
            </div>
            <div>
              <h2>{item.name}</h2>
              <div className="sub">
                <span>by {item.author}</span>
                <span className="sep">·</span>
                {isSkill(item) && (
                  <>
                    <span>role · {item.role}</span>
                    <span className="sep">·</span>
                  </>
                )}
                {isConnector(item) && (
                  <>
                    <span>source · {item.source}</span>
                    <span className="sep">·</span>
                  </>
                )}
                {isProvider(item) && (
                  <>
                    <span>role · {item.role}-provider</span>
                    <span className="sep">·</span>
                  </>
                )}
                <span>{item.license}</span>
              </div>
            </div>
          </div>

          <p className="lede">
            {item.desc}{" "}
            {effectiveInstallEnabled && isSkill(item) &&
              "When a studio runs this skill, BBC pulls the read-set from memory, asks for the first-use inputs once, and files outputs back to /queue for review. Every claim is cited."}
            {effectiveInstallEnabled && isConnector(item) &&
              "BBC opens the OAuth flow inside Settings, syncs the first batch, and files proposals to /queue rather than writing memory directly. You review before anything lands."}
            {effectiveInstallEnabled && isProvider(item) &&
              "Providers are vendor adapters. \"Bound\" means a binding row exists in memory/ops/bindings.yaml — it does NOT verify the API key works. Test the key at /settings/keys."}
            {!effectiveInstallEnabled &&
              "Browse-only for now. Install and connect flows land in a later milestone — installed/bound badges still reflect real state from /settings/keys + tenant_connectors."}
          </p>

          <div className="lib-section">
            <div className="lab">
              <span>typed-schema mapping</span>
            </div>
            <div className="schema" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {isSkill(item) && (
                <>
                  <span className="lab" style={{ fontFamily: "Geist Mono, monospace", fontSize: 11, color: "var(--paper-muted)" }}>
                    reads:
                  </span>
                  {item.reads.map((r) => (
                    <SchemaChip key={"r" + r} name={r} />
                  ))}
                  <span style={{ flexBasis: "100%", height: 0 }} />
                  <span className="lab" style={{ fontFamily: "Geist Mono, monospace", fontSize: 11, color: "var(--paper-muted)" }}>
                    writes:
                  </span>
                  {item.writes.length > 0 ? (
                    item.writes.map((w) => <SchemaChip key={"w" + w} name={w} />)
                  ) : (
                    <span className="schema-chip" style={{ "--tag-color": "var(--paper-muted)" } as TagColorStyle}>
                      <span className="dot" />
                      none
                    </span>
                  )}
                </>
              )}
              {isConnector(item) && (
                <>
                  <span className="lab" style={{ fontFamily: "Geist Mono, monospace", fontSize: 11, color: "var(--paper-muted)" }}>
                    writes:
                  </span>
                  {item.writes.map((w) => (
                    <SchemaChip key={w} name={w} />
                  ))}
                </>
              )}
              {isProvider(item) && (
                <span className="schema-chip" style={{ "--tag-color": "var(--ink)" } as TagColorStyle}>
                  <span className="dot" />
                  role · {item.role}-provider
                </span>
              )}
            </div>
          </div>

          {isSkill(item) && firstUseInputs && (
            <div className="lib-section">
              <div className="lab">
                <span>first-use inputs · asked at run time</span>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--muted-2)" }}>
                  {firstUseInputs.length} fields
                </span>
              </div>
              <ul className="lib-inputs">
                {firstUseInputs.map((f, i) => (
                  <li key={f.k}>
                    <span className="n">{(i + 1).toString().padStart(2, "0")}</span>
                    <span className="k">{f.k}</span>
                    <span className="desc">{f.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {effectiveInstallEnabled && isConnector(item) && item.unverified_oauth && (
            <div className="lib-section lib-warning" role="note">
              <div className="lab">
                <span>unverified app · expect a Google warning</span>
              </div>
              <p className="lib-warning-body">
                BBC&apos;s Google OAuth app is still in verification review. When you click install you&apos;ll see a Google &quot;this app isn&apos;t verified&quot; warning — to continue, click <strong>Advanced</strong> → <strong>Go to BBC (unsafe)</strong>. BBC reads {item.scopes_yes.join(", ")} only; no writes.
              </p>
            </div>
          )}

          {isConnector(item) && (
            <div className="lib-section">
              <div className="lab">
                <span>oauth permissions preview</span>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--muted-2)" }}>
                  before you install
                </span>
              </div>
              <div className="lib-scope">
                <div className="col allow">
                  <div className="h">
                    <Icons.check /> will read
                  </div>
                  <ul>
                    {item.scopes_yes.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div className="col deny">
                  <div className="h">
                    <Icons.x /> will not access
                  </div>
                  <ul>
                    {item.scopes_no.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {isProvider(item) && (
            <div className="lib-section">
              <div className="lab">
                <span>connection state</span>
              </div>
              <div className="lib-kv">
                <span className="k">status</span>
                <span className="v">
                  {item.connected ? (
                    <span className="pill ok">
                      <span className="dot" /> bound
                    </span>
                  ) : (
                    <span className="pill muted">
                      <span className="dot" /> not bound
                    </span>
                  )}
                </span>
                <span className="k">env key</span>
                <span className="v">
                  <code>{item.env}</code>
                </span>
                <span className="k">last test</span>
                <span className="v">{item.lastTest}</span>
                <span className="k">configure</span>
                <span className="v">
                  <a href="/settings/keys">settings / keys / {item.name.toLowerCase()}</a>
                </span>
              </div>
            </div>
          )}

          {!isProvider(item) && (
            <div className="lib-section">
              <div className="lab">
                <span>provenance</span>
              </div>
              <div className="lib-kv">
                <span className="k">repo</span>
                <span className="v">
                  <a href={`https://${item.repo}`} target="_blank" rel="noreferrer">
                    <Icons.github /> {item.repo} <Icons.open />
                  </a>
                </span>
                <span className="k">license</span>
                <span className="v">
                  <code>{item.license}</code>
                </span>
                {isSkill(item) && (
                  <>
                    <span className="k">last updated</span>
                    <span className="v">{item.updated}</span>
                    <span className="k">stars</span>
                    <span className="v">★ {item.stars}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="lib-drawer-foot">
          <div className="left">
            {installed ? (
              isProvider(item) ? (
                <>currently bound</>
              ) : installedHint ? (
                <>{installedHint}</>
              ) : (
                <>currently installed</>
              )
            ) : isProvider(item) ? (
              effectiveInstallEnabled ? (
                <>requires <strong>{item.env}</strong> in /settings/keys</>
              ) : (
                <>catalog only — connect lands in a later milestone</>
              )
            ) : effectiveInstallEnabled ? (
              <>installing files this to <strong>/library/{kindWord}/{item.id}</strong></>
            ) : (
              <>catalog only — install lands in a later milestone</>
            )}
          </div>
          {effectiveInstallEnabled && (
            <>
              {installed && isSkill(item) && (
                <button type="button" className="btn btn-ghost">
                  open in studio →
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => onInstall(item)}
                aria-label={`${installed ? "Reinstall" : "Install"} ${item.name}`}
                style={
                  installed
                    ? { background: "transparent", color: "var(--ink)", border: "1px solid var(--rule-2)" }
                    : undefined
                }
              >
                {installing ? (
                  <>
                    <span className="lib-spinner" /> installing…
                  </>
                ) : installed ? (
                  isProvider(item) ? (
                    "disconnect"
                  ) : isConnector(item) ? (
                    "reinstall"
                  ) : (
                    "uninstall"
                  )
                ) : isProvider(item) ? (
                  "connect"
                ) : (
                  "install"
                )}
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
