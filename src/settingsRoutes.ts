import type { Express, Request, Response } from 'express';
import { getMeta, setMeta } from './db.js';

const SETTINGS_KEYS = [
  // --- Meta API credentials ---
  'meta_app_id',
  'meta_app_secret',
  'meta_access_token',
  'meta_page_id',
  'meta_ig_user_id',
  'meta_ad_account_id',
  'meta_graph_api_version',

  // --- Default ad targeting ---
  'default_posting_timezone',
  'default_ad_radius_km',
  'default_ad_age_min',
  'default_ad_age_max',
  'default_target_locations',
  'default_target_interests',
  'target_location_groups',

  // --- Ad spend budgets & limits (Meta) ---
  'meta_ad_daily_budget_aud',
  'meta_ad_weekly_spend_limit_aud',
  'meta_ad_monthly_spend_limit_aud',

  // --- Google Ads ---
  'google_ads_customer_id',
  'google_ads_api_key',
  'google_ads_daily_budget_aud',
  'google_ads_weekly_spend_limit_aud',
  'google_ads_monthly_spend_limit_aud',

  // --- LinkedIn Ads ---
  'linkedin_ads_daily_budget_aud',
  'linkedin_ads_weekly_spend_limit_aud',
  'linkedin_ads_monthly_spend_limit_aud',

  // --- Scheduler & automation ---
  'scheduler_enabled',
  'scheduler_interval_ms',
  'scraping_enabled',
  'upload_email_api_enabled',

  // --- Brand rules ---
  'brand_forbid_competitor_names',
  'brand_max_quoted_words',
  'brand_allow_price_claims',

  // --- AI content generation (text) ---
  'llm_provider',
  'llm_api_key',

  // --- AI image generation ---
  'image_gen_provider',
  'image_gen_api_key',
  'image_gen_auto_crop',
  'image_gen_crop_bottom_pct',
  'image_gen_crop_right_pct',
  'image_gen_require_review',

  // --- Brand logo overlay ---
  'brand_overlay_enabled',
  'brand_overlay_logo_path',
  'brand_overlay_position',
  'brand_overlay_opacity',
  'brand_overlay_scale_pct',
  'brand_overlay_margin_px',

  // --- AI guardrails ---
  'ai_access_mode',
  'ai_auto_approve_drafts',
  'ai_max_drafts_per_day',
  'ai_allowed_topics',
  'ai_blocked_topics',

  // --- Email notifications ---
  'notify_email_to',
  'notify_smtp_host',
  'notify_smtp_port',
  'notify_smtp_user',
  'notify_smtp_pass',
  'notify_on_draft_created',
  'notify_on_post_published',
  'notify_on_post_failed',
  'notify_on_budget_threshold',

  // --- Asset library ---
  'asset_library_path',

  // --- Webhook ---
  'webhook_secret',

  // --- LinkedIn platform ---
  'linkedin_access_token',
  'linkedin_org_id',

  // --- Google Business Profile ---
  'gbp_access_token',
  'gbp_location_id',
] as const;

type SettingsKey = (typeof SETTINGS_KEYS)[number];

function isSettingsKey(key: string): key is SettingsKey {
  return (SETTINGS_KEYS as readonly string[]).includes(key);
}

const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'meta_app_secret',
  'meta_access_token',
  'llm_api_key',
  'image_gen_api_key',
  'google_ads_api_key',
  'notify_smtp_pass',
  'webhook_secret',
  'linkedin_access_token',
  'gbp_access_token',
]);

function maskValue(key: string, value: string | null): string | null {
  if (value === null) return null;
  if (SENSITIVE_KEYS.has(key) && value.length > 8) {
    return value.slice(0, 4) + '••••' + value.slice(-4);
  }
  return value;
}

export function registerSettingsRoutes(app: Express): void {
  app.get('/api/settings', (_req: Request, res: Response) => {
    try {
      const settings: Record<string, string | null> = {};
      for (const key of SETTINGS_KEYS) {
        settings[key] = maskValue(key, getMeta(key));
      }
      res.json({ settings });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, message: msg });
    }
  });

  app.post('/api/settings', (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      if (typeof body !== 'object' || body === null) {
        res.status(400).json({ ok: false, message: 'Body must be a JSON object' });
        return;
      }

      let updated = 0;
      for (const [key, value] of Object.entries(body)) {
        if (!isSettingsKey(key)) continue;
        if (typeof value !== 'string') continue;
        if (SENSITIVE_KEYS.has(key) && value.includes('••••')) continue;
        setMeta(key, value);
        updated++;
      }

      res.json({ ok: true, updated });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, message: msg });
    }
  });

  app.get('/api/settings/health-check', async (_req: Request, res: Response) => {
    const token = getMeta('meta_access_token');
    if (!token) {
      res.json({ ok: false, reason: 'no_token', message: 'No access token configured' });
      return;
    }
    try {
      const version = getMeta('meta_graph_api_version') ?? 'v21.0';
      const url = `https://graph.facebook.com/${version}/me?access_token=${encodeURIComponent(token)}`;
      const response = await fetch(url);
      const json = (await response.json()) as Record<string, unknown>;
      if (json.error) {
        res.json({ ok: false, reason: 'meta_error', message: JSON.stringify(json.error) });
      } else {
        res.json({ ok: true, name: json.name, id: json.id });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.json({ ok: false, reason: 'network_error', message: msg });
    }
  });
}
