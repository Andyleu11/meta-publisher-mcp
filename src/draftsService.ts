import {
  getDraftPostById,
  insertScheduledPost,
  linkDraftToScheduledPost,
  withTransaction
} from './db.js';

const ALLOWED_PLATFORMS = new Set(['facebook', 'instagram', 'linkedin', 'google_business']);

function platformsJsonToScheduledPlatform(platformsJson: string): string {
  let arr: string[] = [];
  try {
    arr = JSON.parse(platformsJson) as string[];
  } catch {
    throw new Error('Draft platforms JSON is invalid');
  }
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error('Draft must list at least one platform');
  }
  const norm = arr.map((s) => String(s).toLowerCase()).filter((p) => ALLOWED_PLATFORMS.has(p));
  if (norm.length === 0) {
    throw new Error('Draft platforms must include at least one supported platform');
  }
  const hasFb = norm.includes('facebook');
  const hasIg = norm.includes('instagram');
  if (hasFb && hasIg) return 'both';
  return norm[0];
}

/**
 * Promote an approved draft into `scheduled_posts` and link the draft row.
 * Does not call Meta directly — the in-process scheduler publishes when due.
 */
export async function promoteDraftToScheduled(
  draftId: number,
  runAtIso: string
): Promise<{ scheduledId: number }> {
  const ms = Date.parse(runAtIso);
  if (Number.isNaN(ms)) {
    throw new Error('runAtIso must be a parseable ISO-8601 datetime');
  }
  const runAtIsoUtc = new Date(ms).toISOString();

  const row = getDraftPostById(draftId);
  if (!row) {
    throw new Error(`Draft ${draftId} not found`);
  }
  if (row.status !== 'approved') {
    throw new Error(
      `Draft must be approved before scheduling (current status: ${row.status})`
    );
  }
  if (!row.image_url?.trim()) {
    throw new Error(
      'Draft must have a non-empty public image_url before scheduling'
    );
  }

  const platform = platformsJsonToScheduledPlatform(row.platforms);
  const caption = row.caption;
  const imageUrl = row.image_url.trim();

  const scheduledId = withTransaction(() => {
    const id = insertScheduledPost({
      platform,
      runAtIsoUtc,
      caption,
      imageUrl
    });
    linkDraftToScheduledPost(draftId, id);
    return id;
  });

  return { scheduledId };
}
