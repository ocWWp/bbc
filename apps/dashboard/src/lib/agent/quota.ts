// QuotaGate — TypeScript contract for the atomic quota RPCs.
//
// The actual SQL RPCs (reserve_quota, reconcile_quota) ship in M4.1 with
// row-locked SELECT FOR UPDATE atomicity and the lock-first-cleanup-then-
// check ordering documented in
// docs/plans/2026-05-15-agentic-home-migration-policy.md.
//
// v1.6 calling pattern (used by homeTurn + observerRun):
//   const r = await reserveQuota({...}, rpc);
//   if (!r.ok) throw new BudgetExhausted(r.reason);
//   try {
//     const actual = await invokeLlm(...);
//     await reconcileQuota({ reservationId: r.reservationId, actualTokens: actual }, rpc);
//   } catch (e) {
//     // Reservation stays orphaned; next reserve_quota call will lazy-clean it
//     // (per the 5-minute cleanup inside reserve_quota — see migration policy).
//     throw e;
//   }

export type QuotaKind = "home_turn" | "observer_run";

export type ReserveArgs = {
  tenantId: string;
  /** Null when an observer run is invoked without a user-driven trigger. */
  actorId: string | null;
  /** Pre-LLM-call estimate. Reconcile after the call returns actuals. */
  estimatedTokens: number;
  kind: QuotaKind;
};

export type ReserveResult =
  | { ok: true; reservationId: string }
  | { ok: false; reason: string };

export type ReserveRpc = (args: ReserveArgs) => Promise<ReserveResult>;

export type ReconcileArgs = {
  reservationId: string;
  actualTokens: number;
};

/**
 * The RPC layer uses snake_case (Postgres convention). The wrapper
 * function translates so callers stay in camelCase TS.
 */
export type ReconcileRpc = (args: {
  reservation_id: string;
  actual_tokens: number;
}) => Promise<{ ok: boolean }>;

export async function reserveQuota(
  args: ReserveArgs,
  rpc: ReserveRpc,
): Promise<ReserveResult> {
  return rpc(args);
}

export async function reconcileQuota(
  args: ReconcileArgs,
  rpc: ReconcileRpc,
): Promise<{ ok: boolean }> {
  return rpc({
    reservation_id: args.reservationId,
    actual_tokens: args.actualTokens,
  });
}
