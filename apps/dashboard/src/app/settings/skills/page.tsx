import { listSkills, type SkillTier } from "@/lib/read-skills";
import { listCommands } from "@/lib/read-commands";
import { listLeafResources } from "@/lib/read-leaf-resources";
import DataSource from "@/components/DataSource";

export const dynamic = "force-dynamic";

const TIER_LABEL: Record<SkillTier, string> = {
  abstract: "Abstract contracts",
  general: "General · org-wide",
  leaf: "Leaf specializations",
};

const TIER_NOTE: Record<SkillTier, string> = {
  abstract: "Not invocable directly. Concrete skills extend these.",
  general: "Manager-owned concrete skills available org-wide.",
  leaf: "Per-leaf overrides; the resolver picks the most-specific match for the calling layer.",
};

const TIER_PATH: Record<SkillTier, string> = {
  abstract: "memory/skills/_abstract/*.yaml",
  general: "memory/skills/general/*.yaml",
  leaf: "memory/skills/<leaf>/*.yaml",
};

const LAYER_PILL: Record<string, "ok" | "warn" | "muted"> = {
  any: "muted",
  "leaf-or-manager": "ok",
  manager: "warn",
  main: "warn",
  "manager-or-main": "warn",
};

const ROW_STYLE = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1fr) minmax(0, 2fr)",
  gap: 16,
  alignItems: "start",
  padding: "14px 20px",
  borderBottom: "1px solid var(--paper-rule)",
} as const;

const ID_STYLE = {
  fontFamily: "var(--font-geist-mono), monospace",
  fontSize: 13,
  color: "var(--paper-ink)",
  background: "var(--paper-bg-2)",
  border: "1px solid var(--paper-rule)",
  padding: "3px 7px",
  borderRadius: 5,
  display: "inline-block",
} as const;

const META_STYLE = {
  fontFamily: "var(--font-geist-mono), monospace",
  fontSize: 11.5,
  color: "var(--paper-muted)",
  marginTop: 6,
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
} as const;

const DESC_STYLE = {
  fontSize: 13.5,
  color: "var(--paper-ink-2)",
  lineHeight: 1.55,
} as const;

const EMPTY_STYLE = {
  padding: "24px 20px",
  color: "var(--paper-muted)",
  fontSize: 13.5,
  margin: 0,
} as const;

export default async function SkillsSettingsPage() {
  const [skills, commands, leafResources] = await Promise.all([
    listSkills(),
    listCommands(),
    listLeafResources(),
  ]);

  const tiers: SkillTier[] = ["abstract", "general", "leaf"];
  const grouped: Record<SkillTier, typeof skills> = {
    abstract: skills.filter((s) => s.tier === "abstract"),
    general: skills.filter((s) => s.tier === "general"),
    leaf: skills.filter((s) => s.tier === "leaf"),
  };

  const leavesWithResources = leafResources.filter(
    (lr) => lr.agents.length > 0 || lr.pinned_skills.length > 0,
  );

  return (
    <>
      <div className="set-block">
        <div className="set-block-head">
          <div>
            <div className="h">Slash commands · {commands.length}</div>
            <div className="sub">
              Operational. Invoke from any session as{" "}
              <code>/bbc:&lt;name&gt;</code>. Source:{" "}
              <code>.claude/commands/bbc/*.md</code>.
            </div>
          </div>
          <DataSource path=".claude/commands/bbc/*.md" layer="Infra" />
        </div>
        {commands.length === 0 ? (
          <p style={EMPTY_STYLE}>No commands found.</p>
        ) : (
          <div>
            {commands.map((c) => (
              <div key={c.name} style={ROW_STYLE}>
                <div>
                  <code style={ID_STYLE}>/{c.name}</code>
                  {c.layer_hint && (
                    <div style={META_STYLE}>
                      <span className={`pill ${LAYER_PILL[c.layer_hint] ?? "muted"}`}>
                        {c.layer_hint}
                      </span>
                    </div>
                  )}
                </div>
                <div style={DESC_STYLE}>{c.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {tiers.map((tier) => (
        <div key={tier} className="set-block">
          <div className="set-block-head">
            <div>
              <div className="h">
                {TIER_LABEL[tier]} · {grouped[tier].length}
              </div>
              <div className="sub">{TIER_NOTE[tier]}</div>
            </div>
            <DataSource path={TIER_PATH[tier]} layer="Main" />
          </div>
          {grouped[tier].length === 0 ? (
            <p style={EMPTY_STYLE}>None.</p>
          ) : (
            <div>
              {grouped[tier].map((s) => (
                <div key={s.skill_id} style={ROW_STYLE}>
                  <div>
                    <code style={ID_STYLE}>{s.skill_id}</code>
                    <div style={META_STYLE}>
                      {s.is_abstract ? (
                        <span className="pill muted">abstract</span>
                      ) : (
                        <>
                          <span className="pill">{s.layer ?? "?"}</span>
                          {s.extends && (
                            <span>
                              ← extends <code>{s.extends}</code>
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div style={DESC_STYLE}>{s.description}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="set-block">
        <div className="set-block-head">
          <div>
            <div className="h">
              Leaf-local resources · {leavesWithResources.length} leaf
              {leavesWithResources.length === 1 ? "" : "s"}
            </div>
            <div className="sub">
              Sub-agents and pinned external skills that live <em>inside the
              leaf&apos;s repo</em>, not in BBC&apos;s F2 hierarchy. BBC tracks
              them but doesn&apos;t govern them — they belong to the leaf.
            </div>
          </div>
          <DataSource
            path="distribution/<leaf>/.claude/agents/, <leaf>/skills-lock.json, memory/ops/external-skills/"
            layer="Leaf"
          />
        </div>
        {leavesWithResources.length === 0 ? (
          <p style={EMPTY_STYLE}>No leaf-local resources detected.</p>
        ) : (
          <div>
            {leavesWithResources.map((lr) => (
              <div
                key={lr.leaf}
                style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid var(--paper-rule)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-geist), sans-serif",
                      fontSize: 14,
                      fontWeight: 500,
                      color: "var(--paper-accent)",
                    }}
                  >
                    {lr.leaf}
                  </span>
                  <code
                    style={{
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontSize: 11.5,
                      color: "var(--paper-muted)",
                    }}
                  >
                    {lr.shadowed_repo_path}
                  </code>
                  {!lr.shadowed_repo_present && (
                    <span className="pill err">repo missing</span>
                  )}
                </div>

                {lr.agents.length > 0 && (
                  <div
                    style={{
                      border: "1px solid var(--paper-rule)",
                      borderRadius: 8,
                      background: "var(--paper-bg)",
                    }}
                  >
                    <div
                      style={{
                        padding: "8px 14px",
                        borderBottom: "1px solid var(--paper-rule)",
                        fontFamily: "var(--font-geist-mono), monospace",
                        fontSize: 11,
                        color: "var(--paper-muted)",
                      }}
                    >
                      sub-agents · <code>{lr.leaf}/.claude/agents/</code>
                    </div>
                    {lr.agents.map((a) => (
                      <div
                        key={a.name}
                        style={{
                          ...ROW_STYLE,
                          padding: "10px 14px",
                        }}
                      >
                        <div>
                          <code style={ID_STYLE}>{a.name}</code>
                          <div style={META_STYLE}>
                            {a.model && (
                              <span className="pill muted">model: {a.model}</span>
                            )}
                            <code style={{ fontSize: 11 }}>{a.rel_path}</code>
                          </div>
                        </div>
                        <div style={DESC_STYLE}>{a.description}</div>
                      </div>
                    ))}
                  </div>
                )}

                {lr.pinned_skills.length > 0 && (
                  <div
                    style={{
                      border: "1px solid var(--paper-rule)",
                      borderRadius: 8,
                      background: "var(--paper-bg)",
                    }}
                  >
                    <div
                      style={{
                        padding: "8px 14px",
                        borderBottom: "1px solid var(--paper-rule)",
                        fontFamily: "var(--font-geist-mono), monospace",
                        fontSize: 11,
                        color: "var(--paper-muted)",
                      }}
                    >
                      pinned external skills ·{" "}
                      <code>{lr.leaf}/skills-lock.json</code> · descriptions
                      from <code>memory/ops/external-skills/</code>
                    </div>
                    {lr.pinned_skills.map((s) => (
                      <div
                        key={s.name}
                        style={{ ...ROW_STYLE, padding: "10px 14px" }}
                      >
                        <div>
                          <code style={ID_STYLE}>{s.name}</code>
                          <div style={META_STYLE}>
                            {s.source_type && (
                              <span className="pill muted">{s.source_type}</span>
                            )}
                            <code style={{ fontSize: 11 }}>{s.source}</code>
                            {!s.recorded && (
                              <span className="pill warn">no library record</span>
                            )}
                          </div>
                        </div>
                        <div style={DESC_STYLE}>
                          {s.description ?? (
                            <span style={{ color: "var(--paper-muted)" }}>
                              (no library record — file a proposal to add{" "}
                              <code>
                                memory/ops/external-skills/{s.name}.yaml
                              </code>
                              )
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
