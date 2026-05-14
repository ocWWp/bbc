// v1.5 D-W4-3: concrete Supabase impl of LifecycleDb.
//
// Lives separately from lifecycle.ts so the pure logic stays zero-DB-testable.
// All reads/writes go through the supabase client tagged with the caller's
// auth context — RLS narrows by tenant on memory_files / tenant_skills /
// tenant_connectors / recommendations.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LifecycleDb,
  NewRecRow,
  RecRow,
  RecState,
  StatePatch,
} from "./lifecycle";
import type { SkillRole, Signal } from "./recommend";
import type { Supertag } from "@/lib/memory/types";

const KNOWN_ROLES: readonly SkillRole[] = [
  "marketing",
  "engineering",
  "founder",
  "designer",
  "support",
];

const STATES: readonly RecState[] = ["pending", "installed", "dismissed", "snoozed"];

type RawRecRow = {
  id: string;
  tenant_id: string;
  target_kind: string;
  target_id: string;
  reason_code: string;
  reason_human: string;
  state: string;
  recommended_at: string;
  installed_at: string | null;
  dismissed_at: string | null;
  snoozed_until: string | null;
  observed_signal: Record<string, unknown> | null;
};

export function makeSupabaseLifecycleDb(supabase: SupabaseClient): LifecycleDb {
  return {
    async buildSignal(tenant_id: string): Promise<Signal> {
      // Three parallel reads — memory type histogram, installed skills by
      // role, installed connector ids. Tenant_roles is left empty so the
      // engine falls back to "all 5 roles" for the gap rule; deriving it
      // from installed skills would invert the meaning (a tenant with one
      // engineering skill would no longer be eligible for marketing recs).
      // A real profile-driven role set will replace [] once profiles ship.
      const [memoryCounts, skillRoleCounts, connectorIds] = await Promise.all([
        countMemoryByType(supabase, tenant_id),
        countSkillsByRole(supabase, tenant_id),
        listInstalledConnectorIds(supabase, tenant_id),
      ]);

      return {
        tenant_roles: [],
        installed_skills_by_role: skillRoleCounts,
        installed_connectors: new Set(connectorIds),
        memory_counts_by_type: memoryCounts,
      };
    },

    async listPending(tenant_id: string): Promise<RecRow[]> {
      const { data, error } = await supabase
        .from("recommendations")
        .select(
          "id, tenant_id, target_kind, target_id, reason_code, reason_human, state, recommended_at, installed_at, dismissed_at, snoozed_until, observed_signal",
        )
        .eq("tenant_id", tenant_id)
        .eq("state", "pending");
      if (error || !data) return [];
      return (data as RawRecRow[]).map(rawToRow).filter((r): r is RecRow => r !== null);
    },

    async listDismissedSince(tenant_id: string, since: Date): Promise<RecRow[]> {
      const { data, error } = await supabase
        .from("recommendations")
        .select(
          "id, tenant_id, target_kind, target_id, reason_code, reason_human, state, recommended_at, installed_at, dismissed_at, snoozed_until, observed_signal",
        )
        .eq("tenant_id", tenant_id)
        .eq("state", "dismissed")
        .gte("dismissed_at", since.toISOString());
      if (error || !data) return [];
      return (data as RawRecRow[]).map(rawToRow).filter((r): r is RecRow => r !== null);
    },

    async listSnoozedActive(tenant_id: string, now: Date): Promise<RecRow[]> {
      const { data, error } = await supabase
        .from("recommendations")
        .select(
          "id, tenant_id, target_kind, target_id, reason_code, reason_human, state, recommended_at, installed_at, dismissed_at, snoozed_until, observed_signal",
        )
        .eq("tenant_id", tenant_id)
        .eq("state", "snoozed")
        .gt("snoozed_until", now.toISOString());
      if (error || !data) return [];
      return (data as RawRecRow[]).map(rawToRow).filter((r): r is RecRow => r !== null);
    },

    async insertRecommendations(tenant_id: string, rows: NewRecRow[]): Promise<number> {
      if (rows.length === 0) return 0;
      // Service-role-only INSERT (RLS policy on the table allows SELECT/UPDATE
      // for members but no INSERT policy — the recommender runs server-side).
      // We pass tenant_id explicitly because there's no auth.uid() context to
      // derive it from.
      const payload = rows.map((r) => ({
        tenant_id,
        target_kind: r.target_kind,
        target_id: r.target_id,
        reason_code: r.reason_code,
        reason_human: r.reason_human,
        observed_signal: r.observed_signal,
      }));
      // Insert one-by-one so a unique-violation on any single row doesn't
      // poison the rest. The partial unique index on pending may reject a
      // small subset under race; that's the spec ("at least one pending per
      // target"), so we swallow code 23505 and continue.
      let inserted = 0;
      for (const row of payload) {
        const { error } = await supabase.from("recommendations").insert(row);
        if (!error) {
          inserted++;
          continue;
        }
        // 23505 = unique_violation. Treat as benign dedupe; surface everything else.
        if (typeof error.code === "string" && error.code === "23505") continue;
        throw new Error(`insertRecommendations: ${error.message}`);
      }
      return inserted;
    },

    async getRecById(id: string): Promise<RecRow | null> {
      const { data, error } = await supabase
        .from("recommendations")
        .select(
          "id, tenant_id, target_kind, target_id, reason_code, reason_human, state, recommended_at, installed_at, dismissed_at, snoozed_until, observed_signal",
        )
        .eq("id", id)
        .maybeSingle();
      if (error || !data) return null;
      return rawToRow(data as RawRecRow);
    },

    async updateState(id: string, patch: StatePatch): Promise<void> {
      const update: Record<string, unknown> = { state: patch.state };
      if (patch.state === "installed") update.installed_at = patch.installed_at.toISOString();
      if (patch.state === "dismissed") update.dismissed_at = patch.dismissed_at.toISOString();
      if (patch.state === "snoozed") update.snoozed_until = patch.snoozed_until.toISOString();
      // Constrain to pending so the state machine is enforced even if RLS
      // would otherwise allow the write — mirrors the in-memory fake.
      const { error } = await supabase
        .from("recommendations")
        .update(update)
        .eq("id", id)
        .eq("state", "pending");
      if (error) throw new Error(`updateState: ${error.message}`);
    },
  };
}

// --------------------------------------------------------------------------
// Signal builders
// --------------------------------------------------------------------------

async function countMemoryByType(
  supabase: SupabaseClient,
  tenant_id: string,
): Promise<Partial<Record<Supertag, number>>> {
  const { data, error } = await supabase
    .from("memory_files")
    .select("type")
    .eq("tenant_id", tenant_id)
    .eq("status", "active");
  if (error || !data) return {};
  const out: Partial<Record<Supertag, number>> = {};
  for (const row of data as { type: string | null }[]) {
    const t = row.type;
    if (!t) continue;
    out[t as Supertag] = (out[t as Supertag] ?? 0) + 1;
  }
  return out;
}

async function countSkillsByRole(
  supabase: SupabaseClient,
  tenant_id: string,
): Promise<Partial<Record<SkillRole, number>>> {
  const { data, error } = await supabase
    .from("tenant_skills")
    .select("skill_role")
    .eq("tenant_id", tenant_id)
    .is("uninstalled_at", null);
  if (error || !data) return {};
  const out: Partial<Record<SkillRole, number>> = {};
  for (const row of data as { skill_role: string }[]) {
    const r = row.skill_role;
    if (!(KNOWN_ROLES as readonly string[]).includes(r)) continue;
    out[r as SkillRole] = (out[r as SkillRole] ?? 0) + 1;
  }
  return out;
}

async function listInstalledConnectorIds(
  supabase: SupabaseClient,
  tenant_id: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("tenant_connectors")
    .select("connector_id")
    .eq("tenant_id", tenant_id)
    .eq("active", true)
    .is("uninstalled_at", null);
  if (error || !data) return [];
  return (data as { connector_id: string }[]).map((r) => r.connector_id);
}

function rawToRow(raw: RawRecRow): RecRow | null {
  if (!(STATES as readonly string[]).includes(raw.state)) return null;
  if (raw.target_kind !== "skill" && raw.target_kind !== "connector" && raw.target_kind !== "provider") {
    return null;
  }
  return {
    id: raw.id,
    tenant_id: raw.tenant_id,
    target_kind: raw.target_kind,
    target_id: raw.target_id,
    reason_code: raw.reason_code,
    reason_human: raw.reason_human,
    state: raw.state as RecState,
    recommended_at: new Date(raw.recommended_at),
    installed_at: raw.installed_at ? new Date(raw.installed_at) : null,
    dismissed_at: raw.dismissed_at ? new Date(raw.dismissed_at) : null,
    snoozed_until: raw.snoozed_until ? new Date(raw.snoozed_until) : null,
    observed_signal: raw.observed_signal,
  };
}
