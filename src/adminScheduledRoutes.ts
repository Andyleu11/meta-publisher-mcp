/**
 * Admin HTTP routes for scheduled posts (health server only — not MCP).
 *
 * TODO: Protect with authentication (e.g. HTTP Basic Auth, session cookie) or IP allowlist
 * before exposing this port beyond localhost / internal networks.
 */

import { join } from 'path';
import type { Express, Request, Response } from 'express';
import {
  cancelScheduledPost,
  getScheduledPostById,
  listScheduledPosts,
  reschedulePost,
  tryClaimPost
} from './db.js';
import { processScheduledPostRow } from './scheduler.js';

function parseIdParam(req: Request, res: Response): number | null {
  const raw = req.params.id;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ ok: false, message: 'Invalid id' });
    return null;
  }
  return id;
}

export function registerAdminScheduledRoutes(app: Express): void {
  app.get('/api/scheduled-posts', (_req, res) => {
    try {
      const items = listScheduledPosts(500);
      res.json({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, message: msg });
    }
  });

  app.get('/admin/scheduled-posts', (_req, res) => {
    res.sendFile(join(process.cwd(), 'public', 'admin-scheduled-posts.html'));
  });

  app.post('/api/scheduled-posts/:id/cancel', (req, res) => {
    const id = parseIdParam(req, res);
    if (id === null) return;
    try {
      const ok = cancelScheduledPost(id);
      if (!ok) {
        res.status(400).json({
          ok: false,
          message: 'Post not found or not pending'
        });
        return;
      }
      res.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, message: msg });
    }
  });

  app.post('/api/scheduled-posts/:id/reschedule', (req, res) => {
    const id = parseIdParam(req, res);
    if (id === null) return;
    try {
      const body = req.body as Record<string, unknown>;
      const newRunAt = typeof body.run_at === 'string' ? body.run_at.trim() : '';
      if (!newRunAt) {
        res.status(400).json({ ok: false, message: 'run_at is required (ISO-8601 datetime)' });
        return;
      }
      const parsed = new Date(newRunAt);
      if (isNaN(parsed.getTime())) {
        res.status(400).json({ ok: false, message: 'Invalid date format for run_at' });
        return;
      }
      const ok = reschedulePost(id, parsed.toISOString());
      if (!ok) {
        res.status(400).json({ ok: false, message: 'Post not found or not pending' });
        return;
      }
      res.json({ ok: true, run_at: parsed.toISOString() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, message: msg });
    }
  });

  app.post('/api/scheduled-posts/:id/force-send', async (req, res) => {
    const id = parseIdParam(req, res);
    if (id === null) return;
    try {
      const row = getScheduledPostById(id);
      if (!row) {
        res.status(404).json({
          success: false,
          message: 'Scheduled post not found'
        });
        return;
      }
      if (row.status !== 'pending') {
        res.status(400).json({
          success: false,
          message: `Only pending posts can be force-sent (current: ${row.status})`
        });
        return;
      }
      if (!tryClaimPost(id)) {
        res.status(409).json({
          success: false,
          message:
            'Could not claim post (another worker may be processing it)'
        });
        return;
      }
      await processScheduledPostRow(row);
      const after = getScheduledPostById(id);
      const finalStatus = after?.status ?? 'unknown';
      const success = finalStatus === 'posted';
      res.json({
        success,
        message: success
          ? 'Posted to Meta'
          : after?.error ?? `Publish finished with status: ${finalStatus}`,
        status: finalStatus
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ success: false, message: msg });
    }
  });
}
