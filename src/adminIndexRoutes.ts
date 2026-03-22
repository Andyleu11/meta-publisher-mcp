/**
 * Admin landing page and friendly URL aliases for static admin HTML files.
 */

import { join } from 'path';
import type { Express } from 'express';

export function registerAdminIndexRoutes(app: Express): void {
  app.get('/admin', (_req, res) => {
    res.sendFile(join(process.cwd(), 'public', 'admin-index.html'));
  });

  app.get('/admin-scheduled-posts', (_req, res) => {
    res.sendFile(join(process.cwd(), 'public', 'admin-scheduled-posts.html'));
  });

  app.get('/admin-competitor-insights', (_req, res) => {
    res.sendFile(join(process.cwd(), 'public', 'admin-competitor-insights.html'));
  });

  app.get('/admin-post-performance', (_req, res) => {
    res.sendFile(join(process.cwd(), 'public', 'admin-post-performance.html'));
  });

  app.get('/admin-draft-posts', (_req, res) => {
    res.sendFile(join(process.cwd(), 'public', 'admin-draft-posts.html'));
  });
}
