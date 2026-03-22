import { listRecentCompetitorSignals } from './db.js';

/** One signal row in the grouped report (matches MCP `generate_competitor_report` output). */
export type CompetitorReportSignal = {
  dateIso: string;
  source: string;
  headline: string;
  summary: string;
  url: string;
};

export type CompetitorReportPayload = {
  lookbackDays: number;
  competitors: Array<{
    name: string;
    signals: CompetitorReportSignal[];
  }>;
};

/**
 * Build the same JSON structure as MCP `generate_competitor_report` — used by HTTP admin API
 * and the MCP tool (no duplicate grouping logic).
 */
export async function buildCompetitorReport(
  lookbackDays: number
): Promise<CompetitorReportPayload> {
  const clamped = Math.min(365, Math.max(1, Math.floor(lookbackDays)));
  const rows = await listRecentCompetitorSignals(clamped);
  const byName = new Map<string, CompetitorReportSignal[]>();
  for (const s of rows) {
    if (!byName.has(s.competitorName)) {
      byName.set(s.competitorName, []);
    }
    byName.get(s.competitorName)!.push({
      dateIso: s.dateIso,
      source: s.source,
      headline: s.headline,
      summary: s.summary,
      url: s.url
    });
  }
  const names = [...byName.keys()].sort((a, b) => a.localeCompare(b));
  return {
    lookbackDays: clamped,
    competitors: names.map((name) => ({
      name,
      signals: byName.get(name)!
    }))
  };
}
