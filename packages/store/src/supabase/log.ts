import type { SupabaseClient } from "@supabase/supabase-js";
import type { LogEntry, LogStore } from "../interfaces";

type LogRow = {
  v: number;
  ts: string;
  actor: string;
  action: string;
  target: string | null;
  state_hash: string | null;
  lkg_at_emit: number | null;
  payload: Record<string, unknown>;
};

function rowToEntry(row: LogRow): LogEntry {
  const payload = (row.payload ?? {}) as Record<string, string | undefined>;
  return {
    v: row.v,
    ts: row.ts,
    actor: row.actor,
    action: row.action,
    target: row.target ?? "",
    state_hash: row.state_hash ?? undefined,
    lkg_at_emit: row.lkg_at_emit ?? undefined,
    host: payload.host,
    previous_primary: payload.previous_primary,
  };
}

export class SupabaseLogStore implements LogStore {
  constructor(private readonly client: SupabaseClient) {}

  async list(): Promise<LogEntry[]> {
    const { data, error } = await this.client
      .from("operations_log")
      .select("v,ts,actor,action,target,state_hash,lkg_at_emit,payload")
      .order("v", { ascending: true });
    if (error) throw new Error(`SupabaseLogStore.list: ${error.message}`);
    return (data as LogRow[]).map(rowToEntry);
  }

  async lkg(): Promise<number> {
    const { data, error } = await this.client
      .from("operations_log")
      .select("v")
      .order("v", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return 0;
    return (data as { v: number }).v;
  }
}
