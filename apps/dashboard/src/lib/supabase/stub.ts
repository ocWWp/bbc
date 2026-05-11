/**
 * Minimal stub returned by getSupabaseServerClient when no Supabase env vars
 * are configured. Lets the dashboard boot in dev for chrome-only smoke testing
 * (theme, legal pages, cookie banner, command palette) without a Supabase
 * project. Any real query path will return null/empty as if signed out.
 *
 * Cast to the Supabase server client type at the call site is intentionally
 * loose — this is a development-only fallback, not a typed replacement.
 */
type Empty<T> = { data: T | null; error: null };

const emptyChain = {
  select: () => emptyChain,
  eq: () => emptyChain,
  in: () => emptyChain,
  order: () => emptyChain,
  limit: () => emptyChain,
  single: async (): Promise<Empty<unknown>> => ({ data: null, error: null }),
  maybeSingle: async (): Promise<Empty<unknown>> => ({ data: null, error: null }),
  then: (resolve: (v: Empty<unknown[]>) => unknown) => resolve({ data: [], error: null }),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stubSupabaseClient: any = {
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    signOut: async () => ({ error: null }),
  },
  from: () => emptyChain,
};
