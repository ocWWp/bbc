import Link from "next/link";
import type { TeamActivity as TeamActivityData } from "@/lib/home/read-team-activity";

function roleLabel(m: { role: string; template_slug: string | null }): string {
  const r = m.role.charAt(0).toUpperCase() + m.role.slice(1);
  if (!m.template_slug) return r;
  const t = m.template_slug.charAt(0).toUpperCase() + m.template_slug.slice(1);
  return `${r} · ${t}`;
}

export function TeamActivity({ data }: { data: TeamActivityData }) {
  if (data.members.length === 0) {
    return (
      <section className="home-card" data-testid="team-activity">
        <header className="home-card-head">
          <h2 className="home-card-title">Team this week</h2>
        </header>
        <p className="home-card-empty">No teammates yet. Invite at /settings/team.</p>
      </section>
    );
  }

  return (
    <section className="home-card" data-testid="team-activity">
      <header className="home-card-head">
        <h2 className="home-card-title">Team this week</h2>
        <Link href="/settings/team" className="home-card-link">
          manage →
        </Link>
      </header>
      <ul className="home-team-list">
        {data.members.map((m) => (
          <li key={m.user_id} className="home-team-row">
            <Link
              href={`/memory?actor=${encodeURIComponent(m.user_id)}`}
              className="home-team-link"
            >
              <span className="home-team-name">{m.display_name}</span>
              <span className="home-team-role mono">{roleLabel(m)}</span>
              <span className="home-team-counts">
                <span className="home-team-count">
                  <strong>{m.drafts_this_week}</strong> drafts
                </span>
                <span className="home-team-count">
                  <strong>{m.flags_filed}</strong> flags
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
