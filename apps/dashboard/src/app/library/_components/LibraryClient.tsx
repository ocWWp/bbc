"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import {
  CONNECTORS,
  PROV_FILTERS,
  PROVIDERS,
  ROLE_COLOR,
  ROLE_FILTERS,
  SKILLS,
  SOURCE_FILTERS,
  STARTER_PACKS,
  type ConnectorItem,
  type LibItem,
  type LibKind,
  type ProviderItem,
  type SkillItem,
  type SkillRole,
} from "../_data";
import { Icons } from "./Icons";
import { LibCard, RecCard } from "./Cards";
import { DetailDrawer } from "./DetailDrawer";
import { ImportDrawer } from "./ImportDrawer";
import type { PendingRec } from "@/lib/loop3/read-recommendations";
import { dismissRecommendationAction } from "@/lib/loop3/actions";
import { WorkspaceCrumb } from "@/components/WorkspaceCrumb";

type Tab = "default" | "skills" | "connectors" | "providers";

function kindForTab(tab: Tab): LibKind {
  if (tab === "skills") return "skill";
  if (tab === "connectors") return "connector";
  return "provider";
}

type RoleColorStyle = CSSProperties & { "--role-color"?: string };
type ChipColorStyle = CSSProperties & { "--chip-color"?: string };

const STARTER_PACK_BORDER_STYLE = (color: string): CSSProperties & { "--pack-color"?: string } => ({
  "--pack-color": color,
});

export type LibraryClientProps = {
  importedSkills: SkillItem[];
  /** Catalog merged with tenant_connectors install state. Defaults to the
   *  static CONNECTORS array when the server-side reader returns nothing. */
  catalogConnectors?: ConnectorItem[];
  /** Pending recommendations from the W4-3 lifecycle. Empty list = the band
   *  hides itself; the server entry's empty-load path synchronously regens
   *  before render so this only happens for genuinely empty tenants. */
  recommendations?: PendingRec[];
  /** Server-resolved actor.role === "admin". Surfaces the diagnostics link
   *  in the header for admins only; non-admins don't see it (the route
   *  itself 404s for them via requireRole). */
  isAdmin?: boolean;
  /** Workspace slug for the breadcrumb root. */
  tenantSlug: string;
};

export function LibraryClient({
  importedSkills,
  catalogConnectors,
  recommendations,
  isAdmin = false,
  tenantSlug,
}: LibraryClientProps) {
  const allSkills = importedSkills.length === 0 ? SKILLS : [...importedSkills, ...SKILLS];
  const connectors = catalogConnectors ?? CONNECTORS;
  const recs = recommendations ?? [];
  const [dismissedRecIds, setDismissedRecIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  // Optimistic dismiss: hide the card immediately, then call the server
  // action. On failure we silently re-show — the next /library load reads
  // from the DB and corrects any drift.
  function handleDismissRec(recId: string) {
    setDismissedRecIds((prev) => new Set(prev).add(recId));
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", recId);
      const result = await dismissRecommendationAction(fd);
      if (!result.ok) {
        setDismissedRecIds((prev) => {
          const next = new Set(prev);
          next.delete(recId);
          return next;
        });
      }
    });
  }

  const visibleRecs = recs.filter((r) => !dismissedRecIds.has(r.id));
  const [tab, setTab] = useState<Tab>("default");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [onlyInstalled, setOnlyInstalled] = useState(false);
  const [detail, setDetail] = useState<LibItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFlagged, setImportFlagged] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Slash-to-focus: matches the `/` kbd hint shown next to the search input.
  // Mirrors GitHub / Linear / Vercel dashboard convention.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (tab === "default") return;
      e.preventDefault();
      searchInputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab]);

  function handleTab(next: Tab) {
    setTab(next);
    setFilter("all");
    setSearch("");
    setOnlyInstalled(false);
  }

  function handleOpen(item: LibItem) {
    setFocused(item.id);
    setDetail(item);
  }

  function handleInstall(item: LibItem) {
    setInstallingId(item.id);
    window.setTimeout(() => setInstallingId(null), 1600);
  }

  function openImport(flagged = false) {
    setImportFlagged(flagged);
    setImportOpen(true);
  }

  // ---------- list pipeline ----------
  const allItems: LibItem[] =
    tab === "skills" ? allSkills : tab === "connectors" ? connectors : tab === "providers" ? PROVIDERS : [];

  const installedCount = allItems.filter((x) =>
    x.kind === "provider" ? x.connected : x.installed,
  ).length;

  function passesFilter(item: LibItem): boolean {
    if (filter === "all") return true;
    if (item.kind === "skill") return item.role === filter;
    if (item.kind === "connector") return item.source === filter;
    if (item.kind === "provider") return item.role === filter;
    return true;
  }
  function passesInstalled(item: LibItem): boolean {
    if (!onlyInstalled) return true;
    return item.kind === "provider" ? item.connected : item.installed;
  }
  function passesSearch(item: LibItem): boolean {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.desc.toLowerCase().includes(q) ||
      item.author.toLowerCase().includes(q)
    );
  }
  const filtered = allItems.filter((x) => passesFilter(x) && passesInstalled(x) && passesSearch(x));

  // ---------- filter chip definitions ----------
  const filterChips: readonly string[] =
    tab === "skills" ? ROLE_FILTERS : tab === "connectors" ? SOURCE_FILTERS : PROV_FILTERS;
  const filterLabel = tab === "connectors" ? "by source" : "by role";

  function chipColor(key: string): string | null {
    if (tab !== "skills") return null;
    if (key === "all") return null;
    return ROLE_COLOR[key as SkillRole] ?? null;
  }

  function chipCount(key: string): number {
    if (key === "all") return allItems.length;
    if (tab === "skills") return allSkills.filter((s) => s.role === key).length;
    if (tab === "connectors") return connectors.filter((c) => c.source === key).length;
    if (tab === "providers") return PROVIDERS.filter((p) => p.role === key).length;
    return 0;
  }

  // ---------- page chrome (header) ----------
  const titleNode =
    tab === "default" ? (
      <>
        Browse the <span className="serif">library</span>.
      </>
    ) : tab === "skills" ? (
      <>
        Skills <span className="serif">— role templates</span>
      </>
    ) : tab === "connectors" ? (
      <>
        Connectors <span className="serif">— typed ingest</span>
      </>
    ) : (
      <>
        Providers <span className="serif">— vendor adapters</span>
      </>
    );

  const blurb =
    tab === "default"
      ? "Three categories: skills are role templates that drive studios; connectors map external sources to supertag memory; providers are the vendor adapters underneath. Browse the catalog — install + connect flows land in a later milestone."
      : tab === "skills"
        ? "Role templates that drive a studio. Each skill declares which supertags it reads and (sometimes) writes. Importable from any github SKILL.md."
        : tab === "connectors"
          ? "Map external sources to supertag memory. Connectors never write memory directly — they file proposals to /queue, which you review."
          : "Vendor adapters underneath the studios. LLMs, datastores, email, hosting. Bring your own keys.";

  return (
    <div className="container page" style={{ paddingBottom: 96 }}>
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <WorkspaceCrumb tenantSlug={tenantSlug} />
            <span className="sep">/</span>
            <span className="current">library</span>
            {tab !== "default" && (
              <>
                <span className="sep">/</span>
                <span className="current">{tab}</span>
              </>
            )}
          </div>
          <h1 className="page-title">{titleNode}</h1>
          <p className="page-blurb">{blurb}</p>
        </div>
        <div className="page-actions">
          {tab === "skills" && (
            <button type="button" className="btn btn-ghost" onClick={() => openImport(false)}>
              <Icons.link /> import from URL
            </button>
          )}
          {tab === "providers" && (
            <a href="/marketplace" className="btn btn-ghost">
              live provider catalog →
            </a>
          )}
          {isAdmin && (
            <a href="/library/diagnostics" className="btn btn-ghost">
              diagnostics →
            </a>
          )}
          <a
            href="https://github.com/bbc-org"
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost"
          >
            view on github →
          </a>
        </div>
      </header>

      {/* Top sub-tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <div className="tabs">
          {(
            [
              { key: "default" as const, lab: "Overview", ct: null as number | null },
              { key: "skills" as const, lab: "Skills", ct: allSkills.length },
              { key: "connectors" as const, lab: "Connectors", ct: connectors.length },
              { key: "providers" as const, lab: "Providers", ct: PROVIDERS.length },
            ]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              className={tab === t.key ? "is-active" : ""}
              onClick={() => handleTab(t.key)}
            >
              {t.lab}
              {t.ct !== null && (
                <span
                  className="mono"
                  style={{
                    marginLeft: 6,
                    fontSize: 12,
                    color:
                      tab === t.key
                        ? "color-mix(in oklab, var(--ink), transparent 45%)"
                        : "var(--paper-muted)",
                  }}
                >
                  {t.ct}
                </span>
              )}
            </button>
          ))}
        </div>
        {tab !== "default" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontFamily: "Geist Mono, monospace",
              fontSize: 11.5,
              color: "var(--paper-muted)",
            }}
          >
            <span>{installedCount} installed</span>
            <span style={{ color: "var(--rule-2)" }}>·</span>
            <span>{allItems.length} available</span>
          </div>
        )}
      </div>

      {tab === "default" && (
        <>
          <RecommendedBand
            recommendations={visibleRecs}
            allSkills={allSkills}
            connectors={connectors}
            onOpen={handleOpen}
            onInstall={handleInstall}
            onDismiss={handleDismissRec}
          />
          <CategorySlice
            title="Skills"
            tab="skills"
            items={allSkills.slice(0, 3)}
            total={allSkills.length}
            onOpen={handleOpen}
            onInstall={handleInstall}
            installingId={installingId}
            setTab={handleTab}
          />
          <CategorySlice
            title="Connectors"
            tab="connectors"
            items={connectors.slice(0, 3)}
            total={connectors.length}
            onOpen={handleOpen}
            onInstall={handleInstall}
            installingId={installingId}
            setTab={handleTab}
          />
          <CategorySlice
            title="Providers"
            tab="providers"
            items={PROVIDERS.slice(0, 3)}
            total={PROVIDERS.length}
            onOpen={handleOpen}
            onInstall={handleInstall}
            installingId={installingId}
            setTab={handleTab}
          />
        </>
      )}

      {tab !== "default" && (
        <>
          {tab !== "providers" && (
            <RecommendedBand
              small
              recommendations={visibleRecs}
              allSkills={allSkills}
              connectors={connectors}
              onOpen={handleOpen}
              onInstall={handleInstall}
              onDismiss={handleDismissRec}
            />
          )}

          {/* Toolbar */}
          <div className="lib-toolbar">
            <div className="lib-search">
              <span className="lib-search-ic">
                <Icons.search />
              </span>
              <input
                ref={searchInputRef}
                placeholder={`search ${tab}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search library"
              />
              <span className="kbd">/</span>
              {search && (
                <button
                  type="button"
                  className="clear"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  <Icons.x />
                </button>
              )}
            </div>
            <button
              type="button"
              className={`installed-pill ${onlyInstalled ? "is-on" : ""}`}
              onClick={() => setOnlyInstalled((v) => !v)}
              aria-pressed={onlyInstalled}
            >
              <span className="box">{onlyInstalled && <Icons.check />}</span>
              installed only <span className="ct">{installedCount}</span>
            </button>
          </div>

          {/* Filter chips */}
          <div className="lib-chiprow" role="tablist" aria-label={filterLabel}>
            {filterChips.map((c) => {
              const color = chipColor(c);
              const ct = chipCount(c);
              const style: ChipColorStyle | undefined = color ? { "--chip-color": color } : undefined;
              return (
                <button
                  key={c}
                  type="button"
                  className={`lib-chip ${filter === c ? "is-on" : ""}`}
                  onClick={() => setFilter(c)}
                  style={style}
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

          {search && (
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 12,
                fontFamily: "Geist Mono, monospace",
                fontSize: 11.5,
                color: "var(--paper-muted)",
              }}
            >
              <span>
                {filtered.length} result{filtered.length === 1 ? "" : "s"} for &ldquo;
                <span style={{ color: "var(--ink)" }}>{search}</span>&rdquo;
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ height: 24, padding: "0 8px", fontSize: 11 }}
                onClick={() => setSearch("")}
              >
                clear
              </button>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="empty lg">
              <div className="e-eyebrow">no matches</div>
              <h2 className="e-title">Nothing in this slice yet.</h2>
              <p className="e-body">Loosen the filter, clear the search, or paste a skill URL to add one.</p>
              <div className="e-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                    setOnlyInstalled(false);
                  }}
                >
                  clear filters
                </button>
                {tab === "skills" && (
                  <button type="button" className="btn btn-primary" onClick={() => openImport(false)}>
                    import from URL
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="lib-grid">
              {filtered.map((item) => (
                <LibCard
                  key={item.id}
                  item={item}
                  focused={focused === item.id}
                  installingId={installingId}
                  onOpen={handleOpen}
                  onInstall={handleInstall}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Starter packs are reachable from the Overview's bottom section.
          Visible here permanently as the "shape your tenant" hook. */}
      {tab === "default" && (
        <section style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--rule)" }}>
          <div className="section-eyebrow">starter packs · 3 shapes</div>
          <h3
            style={{
              fontFamily: "Geist",
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              margin: "6px 0 16px",
            }}
          >
            Or pick a shape that fits your company.
          </h3>
          <div className="pack-row">
            {STARTER_PACKS.map((p) => (
              <article key={p.id} className="pack-card" style={STARTER_PACK_BORDER_STYLE(p.color)}>
                <div className="pack-head">
                  <div className="pack-eyebrow">starter · {p.bundle.length} items</div>
                  <span className="pill muted">
                    {p.bundle.filter((b) => b.kind === "skill").length} skills ·{" "}
                    {p.bundle.filter((b) => b.kind === "connector").length} connectors
                  </span>
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
                  <span className="summary">{p.bundle.length} items · catalog only</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {detail && (
        <DetailDrawer
          item={detail}
          installingId={installingId}
          onClose={() => setDetail(null)}
          onInstall={(it) => handleInstall(it)}
        />
      )}
      {importOpen && (
        <ImportDrawer
          flaggedDefault={importFlagged}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}

// ---------- Recommended band ----------

/** Per-connector framework id → catalog id mapping. Recommendations carry
 *  the framework id ("github", "notion") because that's the dedupe key the
 *  rule engine uses; the static catalog keys cards on "co_NNN". This shim
 *  lets either id reach the same card. */
const CONNECTOR_ID_TO_CATALOG_ID: Record<string, string> = {
  github: "co_002",
  notion: "co_001",
  linear: "co_003",
  "webhook-generic": "co_005",
  drive: "co_006",
  gmail: "co_007",
};

function resolveRecItem(
  rec: PendingRec,
  allSkills: SkillItem[],
  connectors: ConnectorItem[],
): LibItem | null {
  if (rec.target_kind === "skill") {
    return allSkills.find((s) => s.id === rec.target_id) ?? null;
  }
  if (rec.target_kind === "connector") {
    const catalogId = CONNECTOR_ID_TO_CATALOG_ID[rec.target_id] ?? rec.target_id;
    return connectors.find((c) => c.id === catalogId) ?? null;
  }
  if (rec.target_kind === "provider") {
    return PROVIDERS.find((p) => p.id === rec.target_id) ?? null;
  }
  return null;
}

function RecommendedBand({
  small,
  recommendations,
  allSkills,
  connectors,
  onOpen,
  onInstall,
  onDismiss,
}: {
  small?: boolean;
  /** Pending recs from the lifecycle. Empty list = nothing yet (or the
   *  visit-trigger hasn't run). */
  recommendations: PendingRec[];
  allSkills: SkillItem[];
  /** Same merged catalog as the main grid so install state stays consistent
   *  across the page (codex-flagged: rec card used stale static catalog). */
  connectors: ConnectorItem[];
  onOpen: (item: LibItem) => void;
  onInstall: (item: LibItem) => void;
  onDismiss: (recId: string) => void;
}) {
  const items = recommendations
    .map((rec) => {
      const item = resolveRecItem(rec, allSkills, connectors);
      return item ? { rec, item } : null;
    })
    .filter((x): x is { rec: PendingRec; item: LibItem } => x !== null);

  if (items.length === 0) return null;

  return (
    <div className="rec-band">
      <div className="rec-band-head">
        <div>
          <div className="eyebrow">
            <span className="dot" />
            recommended for you
          </div>
          {!small && <div className="title">Based on your roles · memory shape · and gaps.</div>}
        </div>
        {!small && <span className="why">Hide for power users · BBC explains every recommendation.</span>}
      </div>
      <div className="rec-row">
        {items.map(({ rec, item }) => (
          <RecCard
            key={rec.id}
            item={item}
            why={rec.reason_human}
            onOpen={onOpen}
            onInstall={onInstall}
            onDismiss={() => onDismiss(rec.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Category slice (overview tab) ----------
function CategorySlice({
  title,
  tab,
  items,
  total,
  onOpen,
  onInstall,
  installingId,
  setTab,
}: {
  title: string;
  tab: Tab;
  items: LibItem[];
  total: number;
  onOpen: (item: LibItem) => void;
  onInstall: (item: LibItem) => void;
  installingId: string | null;
  setTab: (t: Tab) => void;
}) {
  const totalForTab = total;
  return (
    <section style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--rule)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div>
          <div className="section-eyebrow" style={{ margin: 0 }}>
            {tab} · {totalForTab} total
          </div>
          <h3
            style={{
              fontFamily: "Geist",
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              margin: "6px 0 0",
            }}
          >
            {title}
          </h3>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setTab(tab)}>
          browse all →
        </button>
      </div>
      <div className="lib-grid">
        {items.map((item) => (
          <LibCard
            key={item.id}
            item={item}
            installingId={installingId}
            onOpen={onOpen}
            onInstall={onInstall}
          />
        ))}
      </div>
    </section>
  );
}
