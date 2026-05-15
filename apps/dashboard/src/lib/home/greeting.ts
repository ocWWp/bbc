// Template greeting for the empty /home state.
//
// Pure function, no LLM call. The point is: page load is fast, and the
// first line of text reflects the brain's actual state (signal counts,
// queue depth) — so it feels like "your brain has been thinking,"
// not "generic hello." A real LLM-authored greeting on cold start adds
// p95 latency for no real reader value.

export type GreetingInputs = {
  /** Active signals across all wired sources. 0 = nothing being watched yet. */
  activeSignalCount: number;
  /** Observations the observer has filed in the last 24h (queue + accepted). */
  recentObservationCount: number;
  /** Items currently in the queue awaiting accept/reject. */
  pendingQueueCount: number;
  /** Tenant display name; falls back to "your workspace" if blank. */
  workspaceName: string;
};

export function homeGreeting(input: GreetingInputs): string {
  const name = input.workspaceName?.trim() || "your workspace";

  // Cold-start: nothing wired, nothing observed, nothing queued.
  if (
    input.activeSignalCount === 0 &&
    input.recentObservationCount === 0 &&
    input.pendingQueueCount === 0
  ) {
    return `Welcome to ${name}. Tell me what you're working on and I'll start watching for it.`;
  }

  // Queue has stuff — that's the highest-priority callout (it's literally
  // "things waiting on you").
  if (input.pendingQueueCount > 0) {
    return `${input.pendingQueueCount} ${plural(
      input.pendingQueueCount,
      "item",
    )} waiting in the queue. What do you want to look at?`;
  }

  // Observer has been busy; surface that.
  if (input.recentObservationCount > 0) {
    return `I logged ${input.recentObservationCount} ${plural(
      input.recentObservationCount,
      "observation",
    )} in the last day. Want me to walk through them?`;
  }

  // Signals are wired but nothing has fired yet. Reassuring + actionable.
  return `Watching ${input.activeSignalCount} ${plural(
    input.activeSignalCount,
    "signal",
  )} for ${name}. Ask me anything in the meantime.`;
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}
