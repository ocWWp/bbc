import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { updateQuotaCaps } from "./actions";

export const metadata = { title: "Quotas · Settings · BBC" };
export const dynamic = "force-dynamic";

// Defaults must mirror the constants inside reserve_quota() (migration
// 0053). When the override column is null these are the active caps —
// the form shows them as placeholder text so admins know what "blank"
// actually does.
const DEFAULTS = {
  max_tokens: 1_000_000,
  max_turns: 1_000,
  max_runs: 240,
  max_signals: 10,
} as const;

type QuotaRow = {
  tokens_used: number;
  turns_count: number;
  runs_today: number;
  signals_active: number;
  max_tokens_override: number | null;
  max_turns_override: number | null;
  max_runs_override: number | null;
  max_signals_override: number | null;
  period_start: string;
};

type Bound = {
  key: "max_tokens" | "max_turns" | "max_runs" | "max_signals";
  label: string;
  blurb: string;
  used: number;
  override: number | null;
  default: number;
  max: number;
};

type AuditEntry = {
  ts: string;
  actor: string;
  before: Partial<Record<Bound["key"], number | null>>;
  after: Partial<Record<Bound["key"], number | null>>;
};

type PageProps = {
  searchParams: Promise<{ error?: string; ok?: string }>;
};

export default async function QuotasPage({ searchParams }: PageProps) {
  const { error, ok } = await searchParams;

  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/settings/quotas")}`);
  }
  const isAdmin = a.actor.role === "admin";

  const sb = await getSupabaseServerClient();
  const { data: quotaRow } = await sb
    .from("tenant_quotas")
    .select(
      "tokens_used, turns_count, runs_today, signals_active, max_tokens_override, max_turns_override, max_runs_override, max_signals_override, period_start",
    )
    .eq("tenant_id", a.actor.tenant_id)
    .maybeSingle();
  const q = (quotaRow ?? null) as QuotaRow | null;

  const bounds: Bound[] = [
    {
      key: "max_tokens",
      label: "Tokens / day",
      blurb: "All LLM input + output tokens, /home + observer runs combined.",
      used: q?.tokens_used ?? 0,
      override: q?.max_tokens_override ?? null,
      default: DEFAULTS.max_tokens,
      max: 100_000_000,
    },
    {
      key: "max_turns",
      label: "/home turns / day",
      blurb: "Each user message in /home counts as one turn.",
      used: q?.turns_count ?? 0,
      override: q?.max_turns_override ?? null,
      default: DEFAULTS.max_turns,
      max: 100_000,
    },
    {
      key: "max_runs",
      label: "Observer runs / day",
      blurb: "Background watch runs across all enabled signals.",
      used: q?.runs_today ?? 0,
      override: q?.max_runs_override ?? null,
      default: DEFAULTS.max_runs,
      max: 24_000,
    },
    {
      key: "max_signals",
      label: "Active observer signals",
      blurb: "Concurrent watches you can have enabled.",
      used: q?.signals_active ?? 0,
      override: q?.max_signals_override ?? null,
      default: DEFAULTS.max_signals,
      max: 1_000,
    },
  ];

  const audit = await readRecentCapChanges(sb, a.actor.tenant_id);

  return (
    <>
      <div className="set-block">
        <div className="set-block-head">
          <div>
            <div className="h">Quotas</div>
            <div className="sub">
              Daily budget caps. Each cap defaults to a sane value; admins can
              raise or lower them. Counters reset at UTC midnight.
              {q?.period_start ? ` Today: ${q.period_start}.` : ""}
            </div>
          </div>
          <span className="pill muted">
            {isAdmin ? "admin" : "view-only"}
          </span>
        </div>
        <div className="set-block-rows">
          {bounds.map((b) => {
            const effective = b.override ?? b.default;
            const pct = effective > 0 ? Math.min(100, Math.round((b.used / effective) * 100)) : 0;
            const pillCls = pct >= 90 ? "err" : pct >= 70 ? "warn" : "ok";
            return (
              <div key={b.key} className="row">
                <div style={{ flex: 1 }}>
                  <div className="k">{b.label}</div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--paper-muted)",
                      marginTop: 2,
                    }}
                  >
                    {b.blurb}
                  </div>
                </div>
                <div style={{ minWidth: 140, textAlign: "right" }}>
                  <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 13 }}>
                    {b.used.toLocaleString()} / {effective.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--paper-muted)", marginTop: 2 }}>
                    {b.override === null
                      ? `default (${b.default.toLocaleString()})`
                      : `override · default ${b.default.toLocaleString()}`}
                  </div>
                </div>
                <span className={`pill ${pillCls}`}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {isAdmin && (
        <div className="set-block">
          <div className="set-block-head">
            <div>
              <div className="h">Adjust caps</div>
              <div className="sub">
                Leave a field blank to revert that cap to its default. Changes
                are audited to the Activity log.
              </div>
            </div>
            {error ? <span className="pill err">{error}</span> : null}
            {ok ? <span className="pill ok">{ok}</span> : null}
          </div>
          <form action={updateQuotaCaps}>
            <div className="set-block-rows">
              {bounds.map((b) => (
                <div key={b.key} className="row">
                  <label htmlFor={b.key} style={{ flex: 1 }}>
                    <div className="k">{b.label}</div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--paper-muted)",
                        marginTop: 2,
                      }}
                    >
                      Default {b.default.toLocaleString()}. Max{" "}
                      {b.max.toLocaleString()}.
                    </div>
                  </label>
                  <input
                    id={b.key}
                    name={b.key}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    defaultValue={b.override === null ? "" : String(b.override)}
                    placeholder={b.default.toLocaleString()}
                    style={{
                      width: 160,
                      padding: "8px 10px",
                      border: "1px solid var(--paper-rule)",
                      borderRadius: 8,
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontSize: 13,
                      background: "var(--paper)",
                    }}
                  />
                </div>
              ))}
            </div>
            <div
              style={{
                padding: "14px 20px",
                borderTop: "1px solid var(--paper-rule)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button
                type="submit"
                style={{
                  padding: "8px 16px",
                  border: "1px solid var(--paper-rule)",
                  borderRadius: 8,
                  background: "var(--paper-bg-2)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="set-block">
        <div className="set-block-head">
          <div>
            <div className="h">Recent changes</div>
            <div className="sub">
              Last 10 cap edits from this workspace&apos;s activity log.
            </div>
          </div>
        </div>
        {audit.length === 0 ? (
          <div style={{ padding: "16px 20px", color: "var(--paper-muted)", fontSize: 13 }}>
            No quota cap changes yet.
          </div>
        ) : (
          <div className="set-block-rows">
            {audit.map((row, i) => (
              <div key={i} className="row">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "var(--paper-muted)" }}>
                    {row.ts}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 2 }}>
                    {row.actor}
                  </div>
                </div>
                <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 12 }}>
                  {summarizeDiff(row.before, row.after)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function summarizeDiff(
  before: AuditEntry["before"],
  after: AuditEntry["after"],
): string {
  const parts: string[] = [];
  const keys: Bound["key"][] = ["max_tokens", "max_turns", "max_runs", "max_signals"];
  for (const k of keys) {
    const b = before[k] ?? null;
    const af = after[k] ?? null;
    if (b !== af) {
      parts.push(`${k}: ${b ?? "default"} → ${af ?? "default"}`);
    }
  }
  return parts.length > 0 ? parts.join("  ·  ") : "(no diff)";
}

async function readRecentCapChanges(
  sb: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  tenantId: string,
): Promise<AuditEntry[]> {
  const { data } = await sb
    .from("operations_log")
    .select("ts, actor, payload")
    .eq("tenant_id", tenantId)
    .eq("action", "quota_caps_updated")
    .order("ts", { ascending: false })
    .limit(10);
  type Row = { ts: string; actor: string; payload: Record<string, unknown> | null };
  return ((data ?? []) as Row[]).map((r) => {
    const p = (r.payload ?? {}) as Record<string, unknown>;
    const before = (p.before ?? {}) as AuditEntry["before"];
    const after = (p.after ?? {}) as AuditEntry["after"];
    return { ts: r.ts, actor: r.actor, before, after };
  });
}
