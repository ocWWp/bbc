import { PostHog } from "posthog-node";

let client: PostHog | null = null;

export function getPostHogServer() {
  if (typeof window !== "undefined") {
    throw new Error("getPostHogServer must only be called from the server");
  }
  if (!client) {
    const key = process.env.POSTHOG_API_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (!key || !host) return null;
    client = new PostHog(key, { host, flushAt: 1, flushInterval: 0 });
  }
  return client;
}
