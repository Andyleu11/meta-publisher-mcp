"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PostThumbnailCard } from "@/components/post-thumbnail-card";
import {
  useCompetitorReport,
  usePostPerformance,
  useScheduledPosts,
} from "@/hooks/use-api-data";
import { format } from "date-fns";
import { CalendarClock, CheckCircle2, Megaphone, LayoutList } from "lucide-react";

export default function DashboardPage() {
  const { data: scheduled = [] } = useScheduledPosts();
  const { data: report } = useCompetitorReport();
  const { data: perf = [] } = usePostPerformance();

  const totalScheduled = scheduled.filter((item) => item.status === "pending").length;
  const posted = scheduled.filter((item) => item.status === "posted").length;
  const alerts = (report?.competitors ?? []).reduce((sum, c) => sum + c.signals.length, 0);
  const upcoming = scheduled
    .filter((item) => item.runAtIso)
    .sort((a, b) => a.runAtIso.localeCompare(b.runAtIso))
    .slice(0, 7);
  const recent = scheduled
    .filter((item) => item.status === "posted")
    .sort((a, b) => b.id - a.id)
    .slice(0, 12);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-charcoal">Dashboard</h1>
        <p className="text-sm text-brand-muted">
          Schedule health, recent activity, and competitor signals.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Pending Queue"
          value={String(totalScheduled)}
          icon={<CalendarClock className="h-5 w-5" />}
          color="teal"
        />
        <MetricCard
          label="Published"
          value={String(posted)}
          icon={<CheckCircle2 className="h-5 w-5" />}
          color="jade"
        />
        <MetricCard
          label="Competitor Alerts"
          value={String(alerts)}
          icon={<Megaphone className="h-5 w-5" />}
          color="gold"
        />
        <MetricCard
          label="Total Items"
          value={String(scheduled.length)}
          icon={<LayoutList className="h-5 w-5" />}
          color="emerald"
        />
      </section>

      {recent.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-brand-charcoal">Recent Posts</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {recent.map((post) => {
              const metrics = perf.find((row) => row.metaPostId === String(post.id));
              return (
                <PostThumbnailCard
                  engagement={metrics?.metrics.engagement}
                  imageUrl={post.imageUrl}
                  key={post.id}
                  platform={post.platform}
                  reach={metrics?.metrics.reach}
                  status={post.status}
                  title={post.caption}
                />
              );
            })}
          </div>
        </section>
      )}

      <Card className="rounded-2xl border-l-4 border-l-brand-teal">
        <CardHeader>
          <CardTitle className="text-brand-charcoal">Upcoming Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 ? (
            <p className="text-sm text-brand-muted">No upcoming posts yet.</p>
          ) : (
            upcoming.map((item) => (
              <div
                className="flex items-center justify-between rounded-xl border border-border px-4 py-2.5 transition-colors hover:bg-brand-cream/60"
                key={item.id}
              >
                <p className="line-clamp-1 text-sm font-medium text-brand-charcoal">{item.caption}</p>
                <span className="shrink-0 ml-3 rounded-md bg-brand-teal/10 px-2 py-0.5 text-xs font-medium text-brand-teal">
                  {format(new Date(item.runAtIso), "EEE d MMM, HH:mm")}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const METRIC_STYLES = {
  teal: { bg: "bg-brand-teal/10", text: "text-brand-teal", border: "border-brand-teal/20" },
  jade: { bg: "bg-brand-jade/10", text: "text-brand-jade", border: "border-brand-jade/20" },
  gold: { bg: "bg-brand-gold/10", text: "text-brand-gold", border: "border-brand-gold/20" },
  emerald: { bg: "bg-brand-emerald/10", text: "text-brand-emerald", border: "border-brand-emerald/20" },
} as const;

function MetricCard({
  label,
  value,
  icon,
  color,
}: Readonly<{ label: string; value: string; icon: React.ReactNode; color: keyof typeof METRIC_STYLES }>) {
  const s = METRIC_STYLES[color];
  return (
    <Card className={`rounded-2xl border ${s.border}`}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.bg} ${s.text}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium text-brand-muted uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-brand-charcoal">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
