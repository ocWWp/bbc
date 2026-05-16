import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  HomeTurnDeps,
} from "@/lib/agent";

// Adapters that translate the dep-injected reserveQuota/reconcileQuota
// contracts into supabase.rpc() calls against migration 0048's RPCs.
//
// Both /api/home/turn and /api/observer/run-now/[signalId] consume these
// — keeping them in one place avoids the param-shape drift that bit the
// initial propose_observation wiring.
//
// On RPC failure these helpers THROW rather than returning {ok:false}.
// The {ok:false} channel is reserved for the enumerated exhaustion
// reasons (tokens/turns/runs/signals_exceeded). Masking a DB error as
// "budget exhausted" would mislead the user; homeTurn's caller already
// catches exceptions and emits status='failed'. (Codex M4.6 review.)

type ReserveQuotaFn = HomeTurnDeps["reserveQuota"];
type ReconcileQuotaFn = HomeTurnDeps["reconcileQuota"];

type RpcResponse<T> = { data: T | null; error: { message: string } | null };

// Subset of SupabaseClient we touch. Avoids tying the helper to a specific
// Database type generic.
type RpcClient = {
  rpc: (fn: string, params: Record<string, unknown>) => Promise<RpcResponse<unknown>>;
};

export class QuotaRpcError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "QuotaRpcError";
  }
}

export function makeReserveQuota(
  supabase: SupabaseClient | RpcClient,
): ReserveQuotaFn {
  return async (args) => {
    const { data, error } = await (supabase as RpcClient).rpc("reserve_quota", {
      p_tenant_id: args.tenantId,
      p_actor_id: args.actorId,
      p_estimated_tokens: args.estimatedTokens,
      p_kind: args.kind,
    });
    if (error) {
      throw new QuotaRpcError(`reserve_quota rpc failed: ${error.message}`, error);
    }
    const r = (data ?? {}) as {
      ok?: boolean;
      reservation_id?: string;
      reason?: string;
    };
    if (r.ok === true && typeof r.reservation_id === "string") {
      return { ok: true, reservationId: r.reservation_id };
    }
    return { ok: false, reason: r.reason ?? "unknown" };
  };
}

export function makeReconcileQuota(
  supabase: SupabaseClient | RpcClient,
): ReconcileQuotaFn {
  return async (args) => {
    const { data, error } = await (supabase as RpcClient).rpc("reconcile_quota", {
      p_reservation_id: args.reservation_id,
      p_actual_tokens: args.actual_tokens,
    });
    if (error) {
      throw new QuotaRpcError(
        `reconcile_quota rpc failed: ${error.message}`,
        error,
      );
    }
    const r = (data ?? {}) as { ok?: boolean };
    return { ok: r.ok === true };
  };
}
