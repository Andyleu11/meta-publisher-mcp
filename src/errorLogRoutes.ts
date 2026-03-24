import type { Express, Request, Response } from 'express';
import { listErrorLog, clearErrorLog } from './db.js';

export function registerErrorLogRoutes(app: Express): void {
  app.get('/api/error-log', (_req: Request, res: Response) => {
    try {
      const limit = Math.min(
        Math.max(parseInt(String(_req.query.limit ?? '200'), 10) || 200, 1),
        2000,
      );
      const items = listErrorLog(limit);
      res.json({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, message: msg });
    }
  });

  app.post('/api/error-log/clear', (_req: Request, res: Response) => {
    try {
      clearErrorLog();
      res.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, message: msg });
    }
  });
}
