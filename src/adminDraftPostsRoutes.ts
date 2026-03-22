/**
 * Admin HTTP routes for draft posts (health server only — not MCP).
 *
 * TODO: Protect with authentication before exposing beyond localhost / internal networks.
 */

import { join } from 'path';
import type { Express, Request, Response } from 'express';
import { updateDraftPostStatus } from './db.js';
import { promoteDraftToScheduled } from './draftsService.js';
import { listDraftPostsWithBrandWarnings } from './brandRulesCheck.js';

function parseIdParam(req: Request, res: Response): number | null {
  const raw = req.params.id;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ ok: false, message: 'Invalid id' });
    return null;
  }
  return id;
}

export function registerAdminDraftPostsRoutes(app: Express): void {
  app.get('/api/draft-posts', (req, res) => {
    try {
      const raw = req.query.status;
      const status =
        typeof raw === 'string' && raw.length > 0 ? raw : 'draft';
      const items = listDraftPostsWithBrandWarnings({ status });
      res.json({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, message: msg });
    }
  });

  app.get('/admin/draft-posts', (_req, res) => {
    res.sendFile(join(process.cwd(), 'public', 'admin-draft-posts.html'));
  });

  app.post('/api/draft-posts/:id/status', (req, res) => {
    const id = parseIdParam(req, res);
    if (id === null) return;
    const body = req.body as { status?: unknown };
    const st = body?.status;
    if (st !== 'approved' && st !== 'rejected') {
      res.status(400).json({
        ok: false,
        message: 'Body must be JSON: { "status": "approved" | "rejected" }'
      });
      return;
    }
    try {
      const ok = updateDraftPostStatus(id, st);
      if (!ok) {
        res.status(400).json({
          ok: false,
          message: 'Draft not found or not in draft status'
        });
        return;
      }
      res.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, message: msg });
    }
  });

  app.post('/api/draft-posts/:id/schedule', async (req, res) => {
    const id = parseIdParam(req, res);
    if (id === null) return;
    const body = req.body as { runAtIso?: unknown };
    const runAtIso =
      typeof body?.runAtIso === 'string' ? body.runAtIso.trim() : '';
    if (!runAtIso) {
      res.status(400).json({
        ok: false,
        message: 'Body must be JSON: { "runAtIso": "<ISO-8601 datetime>" }'
      });
      return;
    }
    const t = Date.parse(runAtIso);
    if (Number.isNaN(t)) {
      res.status(400).json({ ok: false, message: 'runAtIso is not a valid date' });
      return;
    }
    try {
      const { scheduledId } = await promoteDraftToScheduled(id, runAtIso);
      res.json({ ok: true, scheduledId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code =
        /not found|must be approved|image_url|platforms|parseable/i.test(msg)
          ? 400
          : 500;
      res.status(code).json({ ok: false, message: msg });
    }
  });
}
