import type { ScheduledPostRow } from './db.js';
import {
  getDuePosts,
  getMeta,
  insertErrorLog,
  markPostStatus,
  reclaimStaleProcessing,
  setMeta,
  tryClaimPost
} from './db.js';
import { runDailyCompetitorScrape } from './competitorScraper.js';
import { publishToplatform, type PostingPlatform } from './postingService.js';

const INTERVAL_MS = Number(process.env.SCHEDULER_INTERVAL_MS ?? 45_000);
/** Re-queue `processing` rows whose claim is older than this (ms). Default 15m. Set 0 to disable. */
const STALE_PROCESSING_MS = Number(
  process.env.SCHEDULER_STALE_PROCESSING_MS ?? 900_000
);

/**
 * Publish one scheduled row to Meta and set `posted` or `failed`.
 * Caller must have claimed the row (`tryClaimPost`) so status is `processing` in the DB.
 */
export async function processScheduledPostRow(
  row: ScheduledPostRow
): Promise<void> {
  try {
    const platforms: PostingPlatform[] =
      row.platform === 'both'
        ? ['facebook', 'instagram']
        : [row.platform as PostingPlatform];

    for (const platform of platforms) {
      const result = await publishToplatform(platform, row.caption, row.image_url);
      if (!result.ok) {
        const errMsg = result.error ?? `${platform} publish failed`;
        markPostStatus(row.id, 'failed', errMsg);
        insertErrorLog('scheduler', `Post ${row.id} failed on ${platform}`, errMsg);
        console.error(`[scheduler] id=${row.id} platform=${platform} status=failed error=${errMsg}`);
        return;
      }
    }

    markPostStatus(row.id, 'posted', null);
    console.log(`[scheduler] id=${row.id} platform=${row.platform} status=posted`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const short = msg.slice(0, 500);
    markPostStatus(row.id, 'failed', short);
    insertErrorLog('scheduler', `Post ${row.id} exception`, short);
    console.error(
      `[scheduler] id=${row.id} platform=${row.platform} status=failed error=${short}`
    );
  }
}

export function startSchedulerLoop(): void {
  if (process.env.SCHEDULER_ENABLED === 'false') {
    console.log('[scheduler] SCHEDULER_ENABLED=false — in-process loop disabled');
    return;
  }

  console.log(
    `[scheduler] A to Z Meta publisher: checking every ${INTERVAL_MS}ms; stale processing reclaim after ${STALE_PROCESSING_MS}ms (SCHEDULER_STALE_PROCESSING_MS, 0=off)`
  );

  const tick = async (): Promise<void> => {
    try {
      const reclaimed = reclaimStaleProcessing(STALE_PROCESSING_MS);
      if (reclaimed > 0) {
        console.log(
          `[scheduler] reclaimed ${reclaimed} stale processing row(s) → pending (timeout ${STALE_PROCESSING_MS}ms)`
        );
      }

      const nowIso = new Date().toISOString();
      // Only `pending` rows (see getDuePosts); cancelled / posted / failed are ignored.
      const due = getDuePosts(nowIso);
      if (due.length === 0) return;

      for (const row of due) {
        if (!tryClaimPost(row.id)) continue;
        await processScheduledPostRow(row);
      }
    } catch (e) {
      console.error('[scheduler] tick error', e);
    }
  };

  setInterval(() => {
    void tick();
  }, INTERVAL_MS);
  void tick();
}

const COMPETITOR_SCRAPE_META_KEY = 'competitor_scrape_last_run_iso';
const COMPETITOR_SCRAPE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Light daily competitor HTML snapshot (see `runDailyCompetitorScrape`). At most once per 24h via `app_meta`,
 * plus an attempt on process start when the last run is older than 24h or missing. Requires `SCRAPING_ENABLED=true`.
 */
export function startCompetitorScrapeScheduler(): void {
  if (process.env.SCRAPING_ENABLED !== 'true') {
    console.log(
      '[competitor-scrape] SCRAPING_ENABLED is not true — daily competitor scrape disabled'
    );
    return;
  }

  const runIfDue = async (): Promise<void> => {
    const last = getMeta(COMPETITOR_SCRAPE_META_KEY);
    const now = Date.now();
    if (last) {
      const lastMs = Date.parse(last);
      if (!Number.isNaN(lastMs) && now - lastMs < COMPETITOR_SCRAPE_INTERVAL_MS) {
        return;
      }
    }
    try {
      const r = await runDailyCompetitorScrape();
      if (!r.ok) {
        console.log(`[competitor-scrape] skipped: ${r.message}`);
        return;
      }
      setMeta(COMPETITOR_SCRAPE_META_KEY, new Date().toISOString());
      console.log(`[competitor-scrape] completed ${r.message}`);
    } catch (e) {
      console.error('[competitor-scrape] run failed', e);
    }
  };

  void runIfDue();
  setInterval(() => {
    void runIfDue();
  }, COMPETITOR_SCRAPE_INTERVAL_MS);
}
