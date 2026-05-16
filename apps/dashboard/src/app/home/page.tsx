import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { ChatHome, type WatchingChip } from "@/components/chat-home/ChatHome";
import type { TurnViewModel } from "@/components/chat-home/TurnView";
import { getActiveSessionWithTurns, type HomeTurn } from "@/lib/home/sessions";
import { readQueueSummary } from "@/lib/home/read-queue-summary";
import { homeGreeting } from "@/lib/home/greeting";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Home · BBC" };

/**
 * /home is the agentic chat surface (v1.6 M2). Admin-only for now — the
 * non-admin redirect to /studio/<slug> is preserved from the v1.5 home;
 * widening access to all roles is a separate v1.7 product decision.
 */
export default async function HomePage() {
  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/home");
  if (a.actor.role !== "admin") {
    const slug = (a.actor.templateSlug ?? "marketing").toLowerCase();
    redirect(`/studio/${slug}`);
  }

  const supabase = await getSupabaseServerClient();
  const [active, queue, watchingRes] = await Promise.all([
    getActiveSessionWithTurns(a.actor.tenant_id, a.actor.user_id, 50),
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

  const initialTurns: TurnViewModel[] = (active?.turns ?? []).map(turnToVm);

  return (
    <ChatHome
      greeting={greeting}
      initialTurns={initialTurns}
      watching={watching}
    />
  );
}

function turnToVm(t: HomeTurn): TurnViewModel {
  const content =
    t.content_jsonb && typeof t.content_jsonb === "object" && !Array.isArray(t.content_jsonb)
      ? (t.content_jsonb as Record<string, unknown>)
      : {};
  const toolCallsRaw = Array.isArray(content.toolCalls) ? content.toolCalls : [];
  const toolCalls = toolCallsRaw
    .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : null))
    .filter((c): c is Record<string, unknown> => c !== null)
    .map((c) => ({
      name: typeof c.name === "string" ? c.name : "unknown",
      payload: c.payload,
    }));
  const citations = Array.isArray(content.citations)
    ? (content.citations as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  return {
    id: t.id,
    role: t.role,
    status: t.status,
    text: typeof content.text === "string" ? content.text : "",
    toolCalls,
    citations,
  };
}
