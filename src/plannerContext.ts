/**
 * Aggregates local signals for weekly / draft post planning (read-only; no posting).
 */

import { getAvailableAssets, getManifestScanRoot } from './assetLoader.js';
import {
  getLatestPostInsightMetrics,
  listRecentCompetitorSignals,
  listRecentScheduledPostsWithMeta,
  listSupplierUpdatesSince
} from './db.js';

const ASSET_RELS_SAMPLE_CAP = 40;

/** Keep in sync with `docs/weekly-content-planning-prompt.md` (audience, suburbs, tone, assets). */
export const PLANNER_VOICE_REMINDERS =
  'Audience: Brisbane bayside (Redlands, Wynnum/Manly, Belmont + surrounds) and Logan where relevant. ' +
  'Use a specific suburb in ~1 of 3 posts only; elsewhere prefer local homes, bayside Brisbane, east Brisbane, or Queensland climate. ' +
  'Vary wording — do not repeat the same suburb list every caption. ' +
  'Voice: one homeowner at the kitchen bench, contractions, one concrete lived detail per post, hook then short paragraphs then a soft specific CTA (not “contact us today”). ' +
  'Do not reuse the same brand tile imageUrl as the last ~10 drafts. ' +
  'Full rules: docs/weekly-content-planning-prompt.md.';

export interface PlannerContextOptions {
  /** How far back to look for competitor/supplier signals, default 30 */
  lookbackDays?: number;
  /** Soft cap on total competitor signals, default 100 */
  maxCompetitorSignals?: number;
  /** Soft cap on total supplier updates, default 100 */
  maxSupplierUpdates?: number;
  /** How many recent posted rows to include for performance, default 20 */
  maxRecentPosts?: number;
}

export interface PlannerCompetitorSignal {
  competitorName: string;
  source: 'website' | 'facebook' | string;
  dateIso: string;
  headline: string;
  summary: string;
  url: string;
}

export interface PlannerSupplierUpdate {
  supplierName: string;
  source: 'website' | 'facebook' | 'instagram' | 'email' | string;
  dateIso: string;
  title: string;
  summary: string;
  url?: string;
  tags?: string[];
  id?: number;
}

export interface PlannerPostPerformance {
  scheduledPostId: number | null;
  platform: 'facebook' | 'instagram' | string;
  captionPreview: string;
  runAtIso: string | null;
  metaPostId: string | null;
  metrics: {
    impressions?: number;
    reach?: number;
    engagement?: number;
  };
}

export interface PlannerAvailableAssets {
  /** Folder that was scanned when the manifest was built (`assets-manifest.json` `root`). */
  manifestScanRoot: string | null;
  count: number;
  /** Subset of `rel` paths — call MCP `list_available_assets` for the full list. */
  sampleRels: string[];
}

export interface PlannerContext {
  generatedAt: string;
  lookbackDays: number;
  competitorSignals: PlannerCompetitorSignal[];
  supplierUpdates: PlannerSupplierUpdate[];
  recentPerformance: PlannerPostPerformance[];
  /** Short voice/geo/dedupe hints; same intent as the weekly markdown prompt. */
  planningReminders: string;
  /** On-disk images/tiles from `data/assets-manifest.json` (see `list_available_assets`). */
  availableAssets: PlannerAvailableAssets;
}

function subDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function mapInsightMetricsToPlanner(
  raw: Record<string, number>
): PlannerPostPerformance['metrics'] {
  const m: PlannerPostPerformance['metrics'] = {};
  if (raw.impressions !== undefined) m.impressions = raw.impressions;
  if (raw.reach !== undefined) m.reach = raw.reach;
  if (raw.engagement !== undefined) m.engagement = raw.engagement;
  return m;
}

function metricsForPostedRow(post: {
  platform: string;
  meta_post_id: string | null;
}): PlannerPostPerformance['metrics'] {
  const id = post.meta_post_id?.trim();
  if (!id) return {};

  const plat = post.platform;
  let raw: Record<string, number> = {};
  if (plat === 'both') {
    const fb = getLatestPostInsightMetrics(id, 'facebook');
    const ig = getLatestPostInsightMetrics(id, 'instagram');
    raw = Object.keys(fb).length > 0 ? fb : ig;
  } else if (plat === 'facebook' || plat === 'instagram') {
    raw = getLatestPostInsightMetrics(id, plat);
  } else {
    raw = getLatestPostInsightMetrics(id, plat);
  }
  return mapInsightMetricsToPlanner(raw);
}

/**
 * Single snapshot for AI planning: competitor signals, supplier updates, recent post performance.
 * Read-only — does not create or schedule posts.
 */
export async function buildPlannerContext(
  options: PlannerContextOptions = {}
): Promise<PlannerContext> {
  const lookbackDays = clampInt(options.lookbackDays ?? 30, 1, 365);
  const maxCompetitorSignals = clampInt(
    options.maxCompetitorSignals ?? 100,
    1,
    500
  );
  const maxSupplierUpdates = clampInt(
    options.maxSupplierUpdates ?? 100,
    1,
    500
  );
  const maxRecentPosts = clampInt(options.maxRecentPosts ?? 20, 1, 200);

  const now = new Date();
  const cutoffDate = subDays(now, lookbackDays);
  const cutoffIso = cutoffDate.toISOString().slice(0, 10);

  const rawSignals = await listRecentCompetitorSignals(lookbackDays);
  const competitorSignals: PlannerCompetitorSignal[] = rawSignals
    .map((s) => ({
      competitorName: s.competitorName,
      source: s.source as PlannerCompetitorSignal['source'],
      dateIso: s.dateIso,
      headline: s.headline,
      summary: s.summary,
      url: s.url
    }))
    .slice(0, maxCompetitorSignals);

  const rawSupplierUpdates = listSupplierUpdatesSince(cutoffIso);
  const supplierUpdates: PlannerSupplierUpdate[] = rawSupplierUpdates
    .slice(0, maxSupplierUpdates)
    .map((u) => {
      let tags: string[] | undefined;
      try {
        tags = JSON.parse(u.tags) as string[];
      } catch {
        tags = undefined;
      }
      const row: PlannerSupplierUpdate = {
        id: u.id,
        supplierName: u.supplier_name,
        source: u.source as PlannerSupplierUpdate['source'],
        dateIso: u.date_iso,
        title: u.title,
        summary: u.summary
      };
      if (u.url) row.url = u.url;
      if (tags && tags.length > 0) row.tags = tags;
      return row;
    });

  const recentPosts = listRecentScheduledPostsWithMeta(maxRecentPosts);
  const recentPerformance: PlannerPostPerformance[] = recentPosts.map(
    (post) => ({
      scheduledPostId: post.id,
      platform: post.platform,
      captionPreview: (post.caption ?? '').slice(0, 160),
      runAtIso: post.run_at ?? null,
      metaPostId: post.meta_post_id ?? null,
      metrics: metricsForPostedRow(post)
    })
  );

  const manifestAssets = getAvailableAssets();
  const availableAssets: PlannerAvailableAssets = {
    manifestScanRoot: getManifestScanRoot(),
    count: manifestAssets.length,
    sampleRels: manifestAssets
      .slice(0, ASSET_RELS_SAMPLE_CAP)
      .map((a) => a.rel)
  };

  return {
    generatedAt: now.toISOString(),
    lookbackDays,
    competitorSignals,
    supplierUpdates,
    recentPerformance,
    planningReminders: PLANNER_VOICE_REMINDERS,
    availableAssets
  };
}
