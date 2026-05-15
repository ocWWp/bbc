import { BrainHealth } from "./BrainHealth";
import { QueueSummary } from "./QueueSummary";
import { Loop3Today } from "./Loop3Today";
import { TeamActivity } from "./TeamActivity";
import type { BrainHealth as BrainHealthData } from "@/lib/home/read-brain-health";
import type { QueueSummary as QueueSummaryData } from "@/lib/home/read-queue-summary";
import type { PendingRec } from "@/lib/loop3/read-recommendations";
import type { TeamActivity as TeamActivityData } from "@/lib/home/read-team-activity";

export type AdminDashboardProps = {
  tenantSlug: string;
  brain: BrainHealthData;
  queue: QueueSummaryData;
  loop3: ReadonlyArray<PendingRec>;
  activity: TeamActivityData;
};

export function AdminDashboard({
  tenantSlug,
  brain,
  queue,
  loop3,
  activity,
}: AdminDashboardProps) {
  return (
    <div className="container page home-page" data-testid="admin-dashboard">
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <span className="current">{tenantSlug}</span>
            <span className="sep">/</span>
            <span className="current">dashboard</span>
          </div>
          <h1 className="page-title">
            today <span className="serif">— at a glance</span>
          </h1>
          <p className="page-blurb">
            What needs your attention. Drill into any card.
          </p>
        </div>
      </header>

      <div className="home-grid">
        <BrainHealth data={brain} />
        <QueueSummary data={queue} />
        <Loop3Today items={loop3} />
        <TeamActivity data={activity} />
      </div>
    </div>
  );
}
