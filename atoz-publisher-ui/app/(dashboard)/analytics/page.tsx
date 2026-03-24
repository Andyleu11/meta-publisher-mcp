"use client";

import { useMemo } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCompetitorReport, usePostPerformance } from "@/hooks/use-api-data";

const CHART_TEAL = "#01998E";
const CHART_GOLD = "#DAA520";
const PLATFORM_FB = "#1877F2";
const PLATFORM_IG = "#E1306C";
const PLATFORM_LI = "#0A66C2";
const PLATFORM_GBP = "#4285F4";

export default function AnalyticsPage() {
  const { data: perf = [] } = usePostPerformance();
  const { data: report } = useCompetitorReport();
  const competitors = report?.competitors ?? [];

  const chartData = perf.slice(0, 10).map((row) => ({
    id: row.metaPostId.slice(0, 8),
    reach: row.metrics.reach ?? 0,
    engagement: row.metrics.engagement ?? 0,
  }));

  const platformBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of perf) {
      counts[row.platform] = (counts[row.platform] ?? 0) + 1;
    }
    const mapping: Array<{ key: string; name: string; color: string }> = [
      { key: "facebook", name: "Facebook", color: PLATFORM_FB },
      { key: "instagram", name: "Instagram", color: PLATFORM_IG },
      { key: "linkedin", name: "LinkedIn", color: PLATFORM_LI },
      { key: "google_business", name: "Google Business", color: PLATFORM_GBP },
    ];
    return mapping
      .map((m) => ({ name: m.name, value: counts[m.key] ?? 0, color: m.color }))
      .filter((entry) => entry.value > 0);
  }, [perf]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-charcoal">Analytics</h1>
        <p className="text-sm text-brand-muted">
          Reach and engagement trends across published content.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl overflow-x-auto lg:col-span-2 border-l-4 border-l-brand-teal">
          <CardHeader>
            <CardTitle className="text-brand-charcoal">Reach vs Engagement</CardTitle>
            <div className="flex items-center gap-4 text-xs text-brand-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: CHART_TEAL }} />
                Reach
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: CHART_GOLD }} />
                Engagement
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <BarChart data={chartData} height={280} width={700}>
              <XAxis dataKey="id" hide />
              <YAxis />
              <Tooltip />
              <Bar dataKey="reach" fill={CHART_TEAL} radius={4} />
              <Bar dataKey="engagement" fill={CHART_GOLD} radius={4} />
            </BarChart>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-l-4 border-l-brand-jade">
          <CardHeader>
            <CardTitle className="text-brand-charcoal">Platform Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <PieChart height={200} width={200}>
              <Pie
                cx="50%"
                cy="50%"
                data={platformBreakdown}
                dataKey="value"
                innerRadius={55}
                nameKey="name"
                outerRadius={85}
                paddingAngle={4}
                strokeWidth={0}
              >
                {platformBreakdown.map((entry) => (
                  <Cell fill={entry.color} key={entry.name} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs text-brand-muted">
              {platformBreakdown.map((entry) => (
                <span className="flex items-center gap-1.5" key={entry.name}>
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} />
                  {entry.name} ({entry.value})
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {competitors.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-brand-charcoal">
            Competitor Insights
            <span className="ml-1.5 text-xs font-normal text-brand-muted">
              ({report?.lookbackDays ?? 14}-day lookback)
            </span>
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {competitors.map((group) => (
              <Card className="rounded-2xl" key={group.name}>
                <CardHeader>
                  <CardTitle className="text-sm text-brand-charcoal">{group.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-brand-muted">
                    {group.signals.length} signal{group.signals.length !== 1 ? "s" : ""}
                  </p>
                  {group.signals.slice(0, 3).map((signal, idx) => (
                    <div className="rounded-lg border border-border bg-brand-cream/40 px-3 py-2" key={`${signal.dateIso}-${idx}`}>
                      <p className="text-xs font-medium text-brand-charcoal">{signal.headline || signal.source}</p>
                      <p className="line-clamp-2 text-xs text-brand-muted">{signal.summary}</p>
                    </div>
                  ))}
                  {group.signals.length > 3 && (
                    <p className="text-xs text-brand-muted">+{group.signals.length - 3} more</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
