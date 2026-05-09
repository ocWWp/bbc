import { getSupabaseServerClient } from "@/lib/supabase/server";

export type Actor = {
  user_id: string;
  provider: "github" | "google" | "email";
  identifier: string;
  /** Stable string fed to bbc/scripts/{accept,reject}.sh as --actor. */
  actor: string;
};

const ACTOR_RE = /^human:(github|google|email):[A-Za-z0-9._%+@-]{1,254}$/;

/**
 * Resolve the signed-in user's BBC actor from the profiles table.
 * Returns { ok: false, output } for unauth / missing profile / bad shape.
 */
export async function requireActor(): Promise<
  { ok: true; actor: Actor } | { ok: false; output: string }
> {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, output: "unauthorized: sign in required" };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("provider, identifier")
    .eq("user_id", user.id)
    .single();

  if (error || !profile) {
    return { ok: false, output: "unauthorized: missing profile" };
  }

  const provider = profile.provider as Actor["provider"];
  const actor = `human:${provider}:${profile.identifier}`;
  if (!ACTOR_RE.test(actor)) {
    return { ok: false, output: "unauthorized: invalid actor shape" };
  }

  return {
    ok: true,
    actor: { user_id: user.id, provider, identifier: profile.identifier, actor },
  };
}
