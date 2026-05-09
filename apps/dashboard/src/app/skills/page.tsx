import { listSkills, type SkillTier } from "@/lib/read-skills";
import { listCommands } from "@/lib/read-commands";
import { listLeafResources } from "@/lib/read-leaf-resources";
import DataSource from "@/components/DataSource";

export const dynamic = "force-dynamic";

const TIER_LABEL: Record<SkillTier, string> = {
  abstract: "Abstract",
  general: "General (org-wide)",
  leaf: "Leaf specializations",
};

const TIER_NOTE: Record<SkillTier, string> = {
  abstract: "Contracts only — not invocable directly. Concrete skills extend these.",
  general: "Manager-owned concrete skills available org-wide.",
  leaf: "Per-leaf overrides; resolver picks the right one based on the calling layer.",
};

const LAYER_PILL: Record<string, "ok" | "warn" | "muted"> = {
  any: "muted",
  "leaf-or-manager": "ok",
  manager: "warn",
  main: "warn",
  "manager-or-main": "warn",
};

export default async function SkillsPage() {
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
    (lr) => lr.agents.length > 0 || lr.pinned_skills.length > 0
  );

  return (
    <>
      <h1>Skills &amp; tools</h1>

      <p className="muted" style={{ marginBottom: 24 }}>
        What this BBC can do. <strong>Slash commands</strong> are operational — invoked from a session
        as <code>/bbc:&lt;name&gt;</code>. <strong>Skills</strong> are inheritable behaviors;
        a leaf invokes the resolver and gets the most-specific specialization.
      </p>

      <div className="section-head">
        <h2>Slash commands</h2>
        <span className="count">{commands.length}</span>
      </div>
      <DataSource path=".claude/commands/bbc/*.md" layer="Infra" />
      {commands.length === 0 ? (
        <p className="empty">no commands found.</p>
      ) : (
        <div className="card">
          {commands.map((c) => (
            <div key={c.name} className="skill-tier">
              <div>
                <div className="skill-id">/{c.name}</div>
                {c.layer_hint && (
                  <div className="skill-meta">
                    <span className={`pill ${LAYER_PILL[c.layer_hint] ?? "muted"}`}>{c.layer_hint}</span>
                  </div>
                )}
              </div>
              <div className="skill-desc">{c.description}</div>
            </div>
          ))}
        </div>
      )}

      {tiers.map((tier) => (
        <section key={tier}>
          <div className="section-head">
            <h2>{TIER_LABEL[tier]}</h2>
            <span className="count">{grouped[tier].length}</span>
          </div>
          <p className="muted" style={{ marginTop: -4, marginBottom: 4, fontSize: 12 }}>
            {TIER_NOTE[tier]}
          </p>
          <DataSource
            path={
              tier === "abstract"
                ? "memory/skills/_abstract/*.yaml"
                : tier === "general"
                ? "memory/skills/general/*.yaml"
                : "memory/skills/<leaf>/*.yaml"
            }
            layer="Main"
          />
          {grouped[tier].length === 0 ? (
            <p className="empty">none.</p>
          ) : (
            <div className="card">
              {grouped[tier].map((s) => (
                <div key={s.skill_id} className="skill-tier">
                  <div>
                    <div className="skill-id">{s.skill_id}</div>
                    <div className="skill-meta">
                      {s.is_abstract ? (
                        <span className="pill muted">abstract</span>
                      ) : (
                        <>
                          <span className="pill">{s.layer ?? "?"}</span>
                          {s.extends && <> ← extends <code>{s.extends}</code></>}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="skill-desc">{s.description}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      <div className="section-head">
        <h2>Leaf-local resources</h2>
        <span className="count">{leavesWithResources.length} leaf(s)</span>
      </div>
      <p className="muted" style={{ marginTop: -4, marginBottom: 8, fontSize: 12 }}>
        Sub-agents and pinned external skills that live <em>inside the leaf&apos;s repo</em>, not in BBC&apos;s F2 hierarchy. BBC tracks them but doesn&apos;t govern them — they belong to the leaf.
      </p>
      <DataSource path="distribution/<leaf>/.claude/agents/, <leaf>/skills-lock.json, memory/ops/external-skills/" layer="Leaf" />
      {leavesWithResources.length === 0 ? (
        <p className="empty">no leaf-local resources detected.</p>
      ) : (
        leavesWithResources.map((lr) => (
          <section key={lr.leaf} style={{ marginBottom: 16 }}>
            <h3 style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={{ color: "var(--accent)" }}>{lr.leaf}</span>
              <code className="mono-sm">{lr.shadowed_repo_path}</code>
              {!lr.shadowed_repo_present && (
                <span className="pill err">repo missing</span>
              )}
            </h3>

            {lr.agents.length > 0 && (
              <div className="card">
                <div className="skill-meta" style={{ marginBottom: 8, color: "var(--muted)" }}>
                  Sub-agents · <code>{lr.leaf}/.claude/agents/</code>
                </div>
                {lr.agents.map((a) => (
                  <div key={a.name} className="skill-tier">
                    <div>
                      <div className="skill-id">{a.name}</div>
                      <div className="skill-meta">
                        {a.model && <span className="pill muted">model: {a.model}</span>}{" "}
                        <code className="mono-sm">{a.rel_path}</code>
                      </div>
                    </div>
                    <div className="skill-desc">{a.description}</div>
                  </div>
                ))}
              </div>
            )}

            {lr.pinned_skills.length > 0 && (
              <div className="card">
                <div className="skill-meta" style={{ marginBottom: 8, color: "var(--muted)" }}>
                  Pinned external skills · <code>{lr.leaf}/skills-lock.json</code> · descriptions from <code>memory/ops/external-skills/</code>
                </div>
                {lr.pinned_skills.map((s) => (
                  <div key={s.name} className="skill-tier">
                    <div>
                      <div className="skill-id">{s.name}</div>
                      <div className="skill-meta">
                        {s.source_type && <span className="pill muted">{s.source_type}</span>}{" "}
                        <code className="mono-sm">{s.source}</code>
                        {!s.recorded && <> <span className="pill warn">no library record</span></>}
                      </div>
                    </div>
                    <div className="skill-desc">
                      {s.description ?? (
                        <span className="muted">
                          (no library record — file a proposal to add{" "}
                          <code>memory/ops/external-skills/{s.name}.yaml</code>)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {lr.agents.length === 0 && lr.pinned_skills.length === 0 && (
              <p className="empty">no agents or pinned skills detected.</p>
            )}
          </section>
        ))
      )}
    </>
  );
}
