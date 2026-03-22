/**
 * Competitor insights — HTTP only (health server). Not exposed via MCP.
 *
 * TODO: Protect with authentication (e.g. HTTP Basic Auth) or IP allowlist before exposing
 * the health port beyond localhost / internal networks.
 */

import { join } from 'path';
import type { Express } from 'express';
import { buildCompetitorReport } from './competitorReport.js';

function parseLookbackDaysParam(raw: unknown): number {
  if (raw === undefined || raw === '') return 14;
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return 14;
  return Math.min(365, Math.floor(n));
}

export function registerCompetitorInsightsRoutes(app: Express): void {
  app.get('/api/competitor-report', async (req, res) => {
    try {
      const lookbackDays = parseLookbackDaysParam(req.query.lookbackDays);
      const report = await buildCompetitorReport(lookbackDays);
      res.json(report);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, message: msg });
    }
  });

  app.get('/admin/competitor-insights', (_req, res) => {
    res.sendFile(join(process.cwd(), 'public', 'admin-competitor-insights.html'));
  });
}
