import express from 'express';
import { join } from 'path';
import { metaConfig } from './config.js';
import { loadAssetManifest } from './assetLoader.js';
import { initSchema } from './db.js';
import { request } from 'undici';
import './brandRules.js';
import { registerAdminDraftPostsRoutes } from './adminDraftPostsRoutes.js';
import { registerAdminIndexRoutes } from './adminIndexRoutes.js';
import { registerAdminScheduledRoutes } from './adminScheduledRoutes.js';
import { registerCompetitorInsightsRoutes } from './competitorInsightsRoutes.js';
import { registerEmailUploadRoutes } from './emailUploadRoutes.js';
import { registerPostPerformanceRoutes } from './postPerformanceRoutes.js';
import { registerSettingsRoutes } from './settingsRoutes.js';
import { registerGenerateDraftRoutes } from './generateDraftRoutes.js';
import { registerWebhookRoutes } from './webhookRoutes.js';
import { registerAssetLibraryRoutes } from './assetLibraryRoutes.js';
import { registerImageGenRoutes } from './imageGenRoutes.js';
import { registerErrorLogRoutes } from './errorLogRoutes.js';

initSchema();
loadAssetManifest();

const app = express();
const PORT = Number(process.env.HEALTH_PORT ?? 4000);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

registerAdminIndexRoutes(app);
registerAdminScheduledRoutes(app);
registerAdminDraftPostsRoutes(app);
registerCompetitorInsightsRoutes(app);
registerPostPerformanceRoutes(app);
registerEmailUploadRoutes(app);
registerSettingsRoutes(app);
registerGenerateDraftRoutes(app);
registerWebhookRoutes(app);
registerAssetLibraryRoutes(app);
registerImageGenRoutes(app);
registerErrorLogRoutes(app);

const publicDir = join(process.cwd(), 'public');
app.use(express.static(publicDir));

const generatedImagesDir = join(process.cwd(), 'data', 'generated-images');
app.use('/generated-images', express.static(generatedImagesDir));

async function checkMetaAuth() {
  const url = new URL(
    `https://graph.facebook.com/${metaConfig.graphApiVersion}/me`
  );
  url.searchParams.set('access_token', metaConfig.accessToken);

  try {
    const { body } = await request(url.toString(), { method: 'GET' });
    const text = await body.text();
    const json = JSON.parse(text) as Record<string, unknown>;

    if (json.error) {
      return {
        ok: false,
        reason: 'meta_error',
        details: json.error
      };
    }

    return {
      ok: true,
      reason: 'ok',
      details: {
        metaUserId: json.id,
        metaName: json.name
      }
    };
  } catch (err: unknown) {
    return {
      ok: false,
      reason: 'network_or_parse_error',
      details: { message: err instanceof Error ? err.message : String(err) }
    };
  }
}

app.get('/', (_req, res) => {
  res.type('html').send(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>A to Z Meta Publisher</title></head><body>` +
      `<p>A to Z Flooring – Meta Publisher MCP health server.</p>` +
      `<p><strong><a href="/admin">Admin index</a></strong> — scheduled posts, competitor insights, post performance, supplier email upload.</p>` +
      `<ul>` +
      `<li><a href="/health">GET /health</a> — Meta token check (JSON)</li>` +
      `<li><a href="/supplier-email-upload.html">Supplier email upload</a> — drag-and-drop .eml / .msg / .zip</li>` +
      `<li><a href="/admin/scheduled-posts">Scheduled posts</a> (<a href="/admin-scheduled-posts">alias</a>) — view / cancel / send now</li>` +
      `<li><a href="/admin/draft-posts">Draft posts</a> (<a href="/admin-draft-posts">alias</a>) — approve / reject / schedule</li>` +
      `<li><a href="/admin/competitor-insights">Competitor insights</a> (<a href="/admin-competitor-insights">alias</a>) — signals from <code>competitor_signals</code></li>` +
      `<li><a href="/admin/post-performance">Post performance</a> (<a href="/admin-post-performance">alias</a>) — <code>post_insights</code> metrics</li>` +
      `</ul></body></html>`
  );
});

app.get('/health', async (_req, res) => {
  const metaStatus = await checkMetaAuth();

  const statusCode = metaStatus.ok ? 200 : 500;
  res.status(statusCode).json({
    service: 'a-to-z-flooring-meta-publisher',
    status: metaStatus.ok ? 'healthy' : 'unhealthy',
    meta: metaStatus
  });
});

app.listen(PORT, async () => {
  console.log(
    `A to Z Flooring health server listening on http://localhost:${PORT}`
  );

  // Startup token validity check
  try {
    const metaStatus = await checkMetaAuth();
    if (metaStatus.ok) {
      const d = metaStatus.details as { metaName?: string; metaUserId?: string };
      console.log(`[startup] Meta token valid — authenticated as "${d.metaName}" (ID: ${d.metaUserId})`);
    } else {
      console.warn('='.repeat(70));
      console.warn('[startup] WARNING: Meta access token is INVALID or EXPIRED');
      console.warn(`[startup] Reason: ${metaStatus.reason}`);
      console.warn(`[startup] Details: ${JSON.stringify(metaStatus.details)}`);
      console.warn('[startup] All scheduled posts will FAIL until the token is updated.');
      console.warn('[startup] Update it in Settings (/settings) or .env (META_ACCESS_TOKEN).');
      console.warn('='.repeat(70));
    }
  } catch (e) {
    console.warn(`[startup] Could not verify Meta token: ${e instanceof Error ? e.message : String(e)}`);
  }
});
