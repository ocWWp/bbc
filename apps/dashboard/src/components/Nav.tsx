import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function Nav() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let label: string | null = null;
  let avatar: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("identifier, display_name, avatar_url")
      .eq("user_id", user.id)
      .single();
    label = profile?.display_name || profile?.identifier || user.email || "user";
    avatar = profile?.avatar_url ?? null;
  }

  return (
    <nav className="top">
      <span className="brand">BBC · dashboard</span>
      <Link href="/">overview</Link>
      <Link href="/queue">queue</Link>
      <Link href="/skills">skills</Link>
      <Link href="/graph">graph</Link>
      <Link href="/log">log</Link>
      <Link href="/bindings">bindings</Link>
      <Link href="/team">team</Link>
      <Link href="/api-keys">api-keys</Link>

      {label ? (
        <div className="nav-user">
          {avatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" width={20} height={20} className="nav-avatar" />
          )}
          <span className="nav-username">{label}</span>
          {process.env.BBC_SIGNUP_MODE === "open" && (
            <Link href="/auth/self-serve" className="btn" title="Create a new tenant where you'll be the admin">
              + new tenant
            </Link>
          )}
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn nav-signout">sign out</button>
          </form>
        </div>
      ) : null}
    </nav>
  );
}
