import type { Express, Request, Response } from 'express';
import { getMeta, setMeta, insertDraftPost, insertScheduledPost } from './db.js';
import { checkDraftCaption } from './brandRulesCheck.js';
import crypto from 'crypto';

function verifySecret(req: Request): boolean {
  const secret = getMeta('webhook_secret');
  if (!secret) return true;
  const provided = req.headers['x-webhook-secret'] ?? req.query.secret;
  return provided === secret;
}

export function registerWebhookRoutes(app: Express): void {
  /**
   * POST /api/webhooks/inbound-draft
   *
   * Accepts a draft post from external automation tools (n8n, Zapier, Make).
   * Body: { caption, imageUrl?, platform?, platforms?, createdBy? }
   * Auth: x-webhook-secret header or ?secret= query param (matched against webhook_secret in settings)
   */
  app.post('/api/webhooks/inbound-draft', (req: Request, res: Response) => {
    if (!verifySecret(req)) {
      res.status(401).json({ ok: false, message: 'Invalid webhook secret' });
      return;
    }

    try {
      const body = req.body as Record<string, unknown>;
      const caption = typeof body.caption === 'string' ? body.caption.trim() : '';
      if (!caption) {
        res.status(400).json({ ok: false, message: 'caption is required' });
        return;
      }

      const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : null;
      const createdBy = typeof body.createdBy === 'string' ? body.createdBy : 'webhook';

      const allowedPlatforms = ['facebook', 'instagram', 'linkedin', 'google_business'];
      let platforms: string[] = [];
      if (Array.isArray(body.platforms)) {
        platforms = (body.platforms as unknown[])
          .filter((p): p is string => typeof p === 'string')
          .filter((p) => allowedPlatforms.includes(p));
      } else if (typeof body.platform === 'string' && allowedPlatforms.includes(body.platform)) {
        platforms = [body.platform];
      }
      if (platforms.length === 0) platforms = ['instagram'];

      const webhookSourceJson = JSON.stringify({ source: 'webhook', createdBy });
      const warnings = checkDraftCaption(caption, webhookSourceJson);
      const draftId = insertDraftPost({
        caption,
        imageUrl,
        platforms,
        createdBy,
        sourceJson: webhookSourceJson,
      });

      res.json({
        ok: true,
        draft: {
          id: draftId,
          caption,
          platforms,
          brandWarnings: warnings.map((w) => w.message),
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, message: msg });
    }
  });

  /**
   * POST /api/webhooks/inbound-schedule
   *
   * Directly schedule a post from an external tool.
   * Body: { caption, imageUrl, platform, runAtIso }
   */
  app.post('/api/webhooks/inbound-schedule', (req: Request, res: Response) => {
    if (!verifySecret(req)) {
      res.status(401).json({ ok: false, message: 'Invalid webhook secret' });
      return;
    }

    try {
      const body = req.body as Record<string, unknown>;
      const caption = typeof body.caption === 'string' ? body.caption.trim() : '';
      const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : '';
      const allowedPlatforms = ['facebook', 'instagram', 'linkedin', 'google_business'];
      const platform = typeof body.platform === 'string' && allowedPlatforms.includes(body.platform)
        ? body.platform
        : 'instagram';
      const runAtIso = typeof body.runAtIso === 'string' ? body.runAtIso : '';

      if (!caption) {
        res.status(400).json({ ok: false, message: 'caption is required' });
        return;
      }
      if (!imageUrl) {
        res.status(400).json({ ok: false, message: 'imageUrl is required for scheduled posts' });
        return;
      }
      if (!runAtIso) {
        res.status(400).json({ ok: false, message: 'runAtIso is required (ISO-8601)' });
        return;
      }
      const parsedDate = new Date(runAtIso);
      if (isNaN(parsedDate.getTime())) {
        res.status(400).json({ ok: false, message: 'runAtIso is not a valid ISO-8601 date' });
        return;
      }

      const warnings = checkDraftCaption(caption, null);
      const scheduledId = insertScheduledPost({
        platform,
        runAtIsoUtc: parsedDate.toISOString(),
        caption,
        imageUrl,
      });

      res.json({
        ok: true,
        scheduled: {
          id: scheduledId,
          platform,
          runAtIso: parsedDate.toISOString(),
          brandWarnings: warnings.map((w) => w.message),
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, message: msg });
    }
  });

  app.post('/api/webhooks/generate-secret', (_req: Request, res: Response) => {
    const secret = crypto.randomBytes(24).toString('hex');
    setMeta('webhook_secret', secret);
    res.json({ ok: true, secret });
  });
}
