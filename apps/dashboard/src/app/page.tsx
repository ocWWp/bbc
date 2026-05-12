import { redirect } from "next/navigation";

/**
 * `/` resolves to `/queue` per the in-app IA: the Queue *is* the dashboard.
 * Studios file proposals back into it; everything human-actionable surfaces
 * there. Pre-port this page was an Overview with phase/log stats — those
 * live in /log and the queue's own summary rail now.
 */
export default function Root() {
  redirect("/queue");
}
