/**
 * Lightweight caption checks: competitor names, long verbatim chunks vs supplier/email context,
 * near-duplicate captions vs recent drafts (Jaccard on word sets), repeated image URL vs recent drafts.
 * Uses `config/brand-rules.json` via `getBrandRules()` and `competitors.json` names.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getBrandRules } from './brandRules.js';
import { isImageUrlInManifest } from './assetLoader.js';
import {
  draftPostRowToListItem,
  getSupplierUpdatesByIds,
  listDraftPosts,
  type DraftPostListItem,
  type DraftPostRow
} from './db.js';

export type BrandCheckWarning = {
  code:
    | 'competitor_name'
    | 'verbatim_supplier'
    | 'near_duplicate_caption'
    | 'repeated_image_asset'
    | 'asset_not_found';
  message: string;
  /** Short snippet: competitor name, matched phrase, or similar draft id */
  detail?: string;
};

const NEAR_DUP_LOOKBACK = 30;
const NEAR_DUP_JACCARD_MIN = 0.52;
const NEAR_DUP_MIN_WORDS = 6;
const REPEAT_IMAGE_LOOKBACK = 10;

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'for',
  'to',
  'in',
  'on',
  'at',
  'your',
  'our',
  'we',
  'you',
  'is',
  'it',
  'its',
  'with',
  'of',
  'are',
  'as',
  'be',
  'this',
  'that',
  'from',
  'by',
  'not',
  'but',
  'if',
  'so',
  'us',
  'can',
  'will',
  'just',
  'get',
  'has',
  'have',
  'was',
  'were',
  'been',
  'than',
  'then',
  'them',
  'their',
  'what',
  'when',
  'who',
  'how',
  'why',
  'all',
  'any',
  'out',
  'up',
  'about',
  'into',
  'over',
  'also',
  'more',
  'some',
  'here',
  'there',
  'they',
  'would',
  'could',
  'should'
]);

export type CheckDraftCaptionOptions = {
  /** When set, that draft row is ignored (e.g. the row being checked after insert). */
  excludeDraftId?: number;
  /** Same row’s image URL — compared to recent drafts for repeat-tile warnings. */
  imageUrl?: string | null;
};

function normalizeCaptionForDedupe(caption: string): string {
  const noTags = caption.replace(/#[\p{L}\d_]+/gu, ' ');
  return noTags
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulWordSet(normalized: string): Set<string> {
  const words = normalized.split(' ').filter(Boolean);
  const set = new Set<string>();
  for (const w of words) {
    if (w.length < 3) continue;
    if (STOPWORDS.has(w)) continue;
    set.add(w);
  }
  return set;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function findNearDuplicateCaption(
  caption: string,
  excludeDraftId: number | undefined
): { draftId: number; score: number } | null {
  const norm = normalizeCaptionForDedupe(caption);
  const wordsNew = meaningfulWordSet(norm);
  if (wordsNew.size < NEAR_DUP_MIN_WORDS) return null;

  const rows = (listDraftPosts(undefined) as DraftPostRow[])
    .filter((row) => row.id !== excludeDraftId)
    .slice(0, NEAR_DUP_LOOKBACK);
  let best: { draftId: number; score: number } | null = null;

  for (const row of rows) {
    const other = meaningfulWordSet(normalizeCaptionForDedupe(row.caption));
    if (other.size < NEAR_DUP_MIN_WORDS) continue;
    const score = jaccardSimilarity(wordsNew, other);
    if (score >= NEAR_DUP_JACCARD_MIN) {
      if (!best || score > best.score) best = { draftId: row.id, score };
    }
  }

  return best;
}

function findRepeatedImageUrl(
  imageUrl: string | null | undefined,
  excludeDraftId: number | undefined
): number | null {
  const u = imageUrl?.trim();
  if (!u) return null;
  const rows = listDraftPosts(undefined) as DraftPostRow[];
  const recent = rows
    .filter((row) => row.id !== excludeDraftId)
    .slice(0, REPEAT_IMAGE_LOOKBACK);
  for (const row of recent) {
    const img = row.image_url?.trim();
    if (img && img === u) return row.id;
  }
  return null;
}

let competitorNamesCache: string[] | null = null;

function loadCompetitorNames(): string[] {
  if (competitorNamesCache) return competitorNamesCache;
  const file = join(process.cwd(), 'competitors.json');
  if (!existsSync(file)) {
    competitorNamesCache = [];
    return competitorNamesCache;
  }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    if (!Array.isArray(raw)) {
      competitorNamesCache = [];
      return competitorNamesCache;
    }
    competitorNamesCache = raw
      .map((x) =>
        x && typeof x === 'object' && 'name' in x
          ? String((x as { name: string }).name).trim()
          : ''
      )
      .filter((n) => n.length >= 2)
      .sort((a, b) => b.length - a.length);
    return competitorNamesCache;
  } catch {
    competitorNamesCache = [];
    return competitorNamesCache;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function captionMentionsCompetitor(caption: string, name: string): boolean {
  const n = name.trim();
  if (n.length < 2) return false;
  if (n.includes(' ')) {
    return caption.toLowerCase().includes(n.toLowerCase());
  }
  if (n.length < 4) return false;
  const re = new RegExp(`\\b${escapeRegExp(n)}\\b`, 'i');
  return re.test(caption);
}

function collectSupplierReferenceStrings(sourceJson: string | null): string[] {
  const out: string[] = [];
  if (!sourceJson?.trim()) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceJson) as unknown;
  } catch {
    return out;
  }
  if (!parsed || typeof parsed !== 'object') return out;
  const o = parsed as Record<string, unknown>;

  const push = (s: unknown) => {
    if (typeof s === 'string' && s.trim().length > 15) out.push(s.trim());
  };

  const topKeys = [
    'supplierSummary',
    'supplierTitle',
    'emailBodySnippet',
    'bodyText',
    'referenceSummary',
    'supplierUpdateSummary',
    'emailBody',
    'title',
    'summary'
  ];
  for (const k of topKeys) push(o[k]);

  if (Array.isArray(o.snippets)) {
    for (const s of o.snippets) push(s);
  }

  if (typeof o.supplier === 'object' && o.supplier !== null) {
    const s = o.supplier as Record<string, unknown>;
    for (const k of ['summary', 'title', 'body']) push(s[k]);
  }

  if (Array.isArray(o.supplierUpdateIds)) {
    const ids = o.supplierUpdateIds
      .map((x) => (typeof x === 'number' ? x : Number(x)))
      .filter((n) => Number.isInteger(n) && n > 0);
    const rows = getSupplierUpdatesByIds(ids);
    for (const r of rows) {
      out.push(`${r.title}\n${r.summary}`);
    }
  }

  return [...new Set(out)];
}

function findVerbatimPhraseOverLimit(
  caption: string,
  reference: string,
  maxWordsAllowed: number
): string | null {
  const cap = caption.toLowerCase().replace(/\s+/g, ' ').trim();
  const refWords = reference
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean);
  const minLen = maxWordsAllowed + 1;
  if (refWords.length < minLen) return null;
  const maxWindow = Math.min(refWords.length, 80);
  for (let len = maxWindow; len >= minLen; len--) {
    for (let i = 0; i + len <= refWords.length; i++) {
      const phrase = refWords.slice(i, i + len).join(' ');
      if (phrase.length < 24) continue;
      if (cap.includes(phrase)) {
        return phrase.length > 160 ? `${phrase.slice(0, 157)}…` : phrase;
      }
    }
  }
  return null;
}

/**
 * Returns non-blocking warnings for a draft caption and optional `source_json` from `draft_posts`.
 */
export function checkDraftCaption(
  caption: string,
  sourceJson: string | null,
  options?: CheckDraftCaptionOptions
): BrandCheckWarning[] {
  const rules = getBrandRules();
  const warnings: BrandCheckWarning[] = [];
  const excludeId = options?.excludeDraftId;
  const imageUrl = options?.imageUrl;

  if (rules.forbidCompetitorNames) {
    const seen = new Set<string>();
    let competitorHits = 0;
    for (const name of loadCompetitorNames()) {
      if (competitorHits >= 10) break;
      if (captionMentionsCompetitor(caption, name) && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        competitorHits += 1;
        warnings.push({
          code: 'competitor_name',
          message: `Caption may mention competitor “${name}” — review before publishing.`,
          detail: name
        });
      }
    }
  }

  const refs = collectSupplierReferenceStrings(sourceJson);
  const maxWords = Math.max(4, Math.floor(rules.maxQuotedWordsFromSupplier));

  for (const ref of refs) {
    const hit = findVerbatimPhraseOverLimit(caption, ref, maxWords);
    if (hit) {
      warnings.push({
        code: 'verbatim_supplier',
        message: `Possible long verbatim chunk from supplier/email context (more than ${maxWords} consecutive words from reference text).`,
        detail: hit
      });
      break;
    }
  }

  const nearDup = findNearDuplicateCaption(caption, excludeId);
  if (nearDup) {
    warnings.push({
      code: 'near_duplicate_caption',
      message:
        'Caption is very similar to a recent draft (same theme/wording). Consider a different angle or hook.',
      detail: `draft #${nearDup.draftId} (~${Math.round(nearDup.score * 100)}% word overlap)`
    });
  }

  const repeatImg = findRepeatedImageUrl(imageUrl, excludeId);
  if (repeatImg !== null) {
    warnings.push({
      code: 'repeated_image_asset',
      message:
        'Same image URL was used on a recent draft — rotate to another tile or photo unless you intend a repeat.',
      detail: `matches draft #${repeatImg}`
    });
  }

  if (imageUrl?.trim() && !isImageUrlInManifest(imageUrl)) {
    warnings.push({
      code: 'asset_not_found',
      message:
        'imageUrl does not match any entry in data/assets-manifest.json — fix the filename or refresh the manifest (see list_available_assets).',
      detail: imageUrl.trim()
    });
  }

  return warnings;
}

export type DraftPostListItemWithBrand = DraftPostListItem & {
  brandWarnings: BrandCheckWarning[];
};

export function listDraftPostsWithBrandWarnings(params: {
  status: string;
  limit?: number;
}): DraftPostListItemWithBrand[] {
  const lim = Math.min(500, Math.max(1, Math.floor(params.limit ?? 500)));
  const rows =
    params.status === 'all'
      ? (listDraftPosts(undefined).slice(0, lim) as DraftPostRow[])
      : (listDraftPosts([params.status]).slice(0, lim) as DraftPostRow[]);
  return rows.map((row) => ({
    ...draftPostRowToListItem(row),
    brandWarnings: checkDraftCaption(row.caption, row.source_json, {
      excludeDraftId: row.id,
      imageUrl: row.image_url
    })
  }));
}
