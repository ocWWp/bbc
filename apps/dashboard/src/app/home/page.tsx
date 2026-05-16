import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { type WatchingChip } from "@/components/chat-home/ChatHome";
import { HomeClient } from "@/components/chat-home/HomeClient";
import type { TurnViewModel } from "@/components/chat-home/TurnView";
import { getSessionWithTurns, listSessions } from "@/lib/home/sessions";
import { turnToVm } from "@/lib/home/turn-to-vm";
import { readQueueSummary } from "@/lib/home/read-queue-summary";
import { homeGreeting } from "@/lib/home/greeting";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Home · BBC" };

// Strict UUID v1-v5 lower- or upper-case shape. Anything that doesn't match
// triggers a redirect to /home — never throw a 500 on malformed query input.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /home is the agentic chat surface (v1.6 M2; PR-C adds the chat-history
 * rail). Admin-only for now — the non-admin redirect to /studio/<slug> is
 * preserved from the v1.5 home; widening access to all roles is a separate
 * v1.7 product decision.
 *
 * PR-C M23: `?session=<uuid>` selects which chat to hydrate. Validation:
 *   - missing / blank   → greeting state with `sessionId = null`
 *   - malformed         → redirect to `/home` (strip the param)
 *   - valid + readable  → hydrate that session's turns
 *   - valid + not found → redirect to `/home` (foreign tenant, archived,
 *                         or just deleted in another tab; `?session=` is
 *                         dropped so the user lands on the greeting state).
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/home");
  if (a.actor.role !== "admin") {
    const slug = (a.actor.templateSlug ?? "marketing").toLowerCase();
    redirect(`/studio/${slug}`);
  }

  const params = await searchParams;
  const raw = params.session;
  if (typeof raw === "string" && raw.length > 0 && !UUID_RE.test(raw)) {
    redirect("/home");
  }
  const sessionId: string | null =
    typeof raw === "string" && raw.length > 0 ? raw : null;

  const supabase = await getSupabaseServerClient();

  // Parallelize: selected-session turns (when sessionId set) + rail list +
  // queue summary + watching chips. Skipping the turns fetch on the bare
  // /home keeps the greeting path one round-trip lighter.
  const sessionTurnsPromise = sessionId
    ? getSessionWithTurns(sessionId, a.actor.tenant_id, a.actor.user_id, 50)
    : Promise.resolve(null);

  const [sessionResult, sessions, queue, watchingRes] = await Promise.all([
    sessionTurnsPromise,
    listSessions(a.actor.tenant_id, a.actor.user_id),
    readQueueSummary(a.actor.tenant_id),
    supabase
      .from("observer_signals")
      .select("id, config_jsonb, signal_type")
      .eq("tenant_id", a.actor.tenant_id)
      .eq("enabled", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(12),
  ]);

  // Valid UUID but no row visible to this (tenant, user) → drop the param
  // and re-render as the greeting. Covers foreign-tenant attempts, archived
  // sessions, and the race where another tab/device just deleted it.
  if (sessionId && !sessionResult) {
    redirect("/home");
  }

  const watching: WatchingChip[] = ((watchingRes?.data ?? []) as Array<{
    id: string;
    signal_type: string;
    config_jsonb: Record<string, unknown> | null;
  }>).map((row) => ({
    id: row.id,
    label:
      typeof row.config_jsonb?.metric === "string"
        ? (row.config_jsonb.metric as string)
        : row.signal_type,
  }));

  const greeting = homeGreeting({
    activeSignalCount: watching.length,
    recentObservationCount: 0,
    pendingQueueCount: queue.pendingCount,
    workspaceName: a.actor.tenant_slug,
  });

  const initialTurns: TurnViewModel[] = (sessionResult?.turns ?? []).map(turnToVm);

  return (
    <HomeClient
      sessionId={sessionId}
      sessions={sessions}
      greeting={greeting}
      initialTurns={initialTurns}
      watching={watching}
    />
  );
}
