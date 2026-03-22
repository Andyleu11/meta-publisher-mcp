/**
 * Post performance (HTTP only, health server). Surfaces `post_insights` metrics.
 *
 * TODO: When `scheduled_posts` stores `meta_post_id` / `posted_at`, join here to fill
 * `id`, `captionPreview`, `scheduledAt`, `postedAt`.
 * TODO: Protect with authentication or IP allowlist before exposing beyond localhost.
 */

import { join } from 'path';
import type { Express, Request, Response } from 'express';
import {
  getLatestPostInsightMetrics,
  listDistinctInsightPosts
} from './db.js';

function parsePlatform(raw: unknown): 'facebook' | 'instagram' | 'all' {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === 'facebook' || v === 'instagram' || v === 'all') return v;
  return 'all';
}

function parseLimit(raw: unknown): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === undefined || v === '') return 50;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(200, Math.floor(n));
}

function pickMetrics(m: Record<string, number>): {
  impressions?: number;
  reach?: number;
  engagement?: number;
} {
  const out: {
    impressions?: number;
    reach?: number;
    engagement?: number;
  } = {};
  if (typeof m.impressions === 'number') out.impressions = m.impressions;
  if (typeof m.reach === 'number') out.reach = m.reach;
  if (typeof m.engagement === 'number') out.engagement = m.engagement;
  return out;
}

export function registerPostPerformanceRoutes(app: Express): void {
  app.get('/api/post-performance', (req: Request, res: Response) => {
    try {
      const platform = parsePlatform(req.query.platform);
      const limit = parseLimit(req.query.limit);
      const keys = listDistinctInsightPosts({ platform, limit });
      const items = keys.map((row) => {
        const metrics = getLatestPostInsightMetrics(row.post_id, row.platform);
        return {
          // TODO: set local id when scheduled_posts.meta_post_id links to row.post_id
          id: null as number | null,
          platform: row.platform,
          captionPreview: null as string | null,
          metaPostId: row.post_id,
          scheduledAt: null as string | null,
          postedAt: null as string | null,
          metrics: pickMetrics(metrics)
        };
      });
      res.json({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, message: msg });
    }
  });

  app.get('/admin/post-performance', (_req, res) => {
    res.sendFile(join(process.cwd(), 'public', 'admin-post-performance.html'));
  });
}
