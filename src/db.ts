import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type { SupplierUpdate } from './supplierTypes.js';

/** `./data/meta-publisher.db` relative to the process working directory. */
function dbFilePath(): string {
  return join(process.cwd(), 'data', 'meta-publisher.db');
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  const file = dbFilePath();
  mkdirSync(dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  return db;
}

/** Run `fn` inside a single SQLite transaction (better-sqlite3). */
export function withTransaction<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}

/**
 * scheduled_posts.status semantics:
 * - pending: waiting for run_at; scheduler will claim and publish.
 * - processing: claimed by scheduler or force-send; publish in flight.
 * - posted: successfully published to Meta.
 * - failed: publish error (see error column).
 * - cancelled: user cancelled before send; scheduler never picks these up.
 */
export type ScheduledPostStatus =
  | 'pending'
  | 'processing'
  | 'posted'
  | 'failed'
  | 'cancelled';

export type ScheduledPostRow = {
  id: number;
  platform: string;
  run_at: string;
  caption: string;
  image_url: string;
  status: string;
  error: string | null;
  created_at: string;
  processing_started_at: string | null;
  updated_at: string | null;
  /** Meta Graph post or media id, when persisted after publish. */
  meta_post_id?: string | null;
  /** When the post was published on Meta (if known). */
  meta_posted_at?: string | null;
};

function migrateScheduledPostsSchema(d: Database.Database): void {
  const cols = d
    .prepare(`PRAGMA table_info(scheduled_posts)`)
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === 'processing_started_at')) {
    d.exec(
      `ALTER TABLE scheduled_posts ADD COLUMN processing_started_at TEXT`
    );
  }
  if (!cols.some((c) => c.name === 'updated_at')) {
    d.exec(`ALTER TABLE scheduled_posts ADD COLUMN updated_at TEXT`);
    d.exec(
      `UPDATE scheduled_posts SET updated_at = created_at WHERE updated_at IS NULL`
    );
  }
  if (!cols.some((c) => c.name === 'meta_post_id')) {
    d.exec(`ALTER TABLE scheduled_posts ADD COLUMN meta_post_id TEXT NULL`);
  }
  if (!cols.some((c) => c.name === 'meta_posted_at')) {
    d.exec(`ALTER TABLE scheduled_posts ADD COLUMN meta_posted_at TEXT NULL`);
  }
}

/**
 * After a crash, any `processing` row never reached `posted`/`failed`. Move back to `pending`
 * so the next tick can retry (rare duplicate post if publish succeeded but the process died before commit).
 */
export function recoverProcessingOnStartup(): number {
  const d = getDb();
  const t = nowIso();
  const r = d
    .prepare(
      `UPDATE scheduled_posts
       SET status = 'pending',
           processing_started_at = NULL,
           error = NULL,
           updated_at = ?
       WHERE status = 'processing'`
    )
    .run(t);
  return r.changes;
}

/**
 * If the worker hangs mid-publish, `processing` can stick until `processing_started_at` is older than
 * the stale threshold; rows are returned to `pending` for retry.
 */
export function reclaimStaleProcessing(staleMs: number): number {
  if (staleMs <= 0) return 0;
  const threshold = new Date(Date.now() - staleMs).toISOString();
  const d = getDb();
  const r = d
    .prepare(
      `UPDATE scheduled_posts
       SET status = 'pending',
           processing_started_at = NULL,
           error = 'reclaimed: processing timeout (stale worker)',
           updated_at = ?
       WHERE status = 'processing'
         AND processing_started_at IS NOT NULL
         AND processing_started_at < ?`
    )
    .run(nowIso(), threshold);
  return r.changes;
}

/** Product / technical signals from supplier sites and public socials (see `src/supplierWatcher.ts`). */
export type SupplierUpdateRow = {
  id: number;
  supplier_name: string;
  date_iso: string;
  source: string;
  url: string;
  title: string;
  summary: string;
  /** JSON array of strings */
  tags: string;
};

export function initSchema(): void {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      run_at TEXT NOT NULL,
      caption TEXT NOT NULL,
      image_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
  `);
  migrateScheduledPostsSchema(d);
  initSupplierUpdatesTable(d);
  initCompetitorSignalsTable(d);
  initAppMetaTable(d);
  initPostInsightsTable(d);
  initEmailAttachmentsTextTable(d);
  initDraftPostsTable(d);
  initErrorLogTable(d);
  const recovered = recoverProcessingOnStartup();
  if (recovered > 0) {
    console.log(
      `[db] recovered ${recovered} stuck processing row(s) → pending (crash / restart)`
    );
  }
}

function initSupplierUpdatesTable(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS supplier_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_name TEXT NOT NULL,
      date_iso TEXT NOT NULL,
      source TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      tags TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_supplier_updates_date ON supplier_updates(date_iso);
    CREATE INDEX IF NOT EXISTS idx_supplier_updates_name ON supplier_updates(supplier_name);
  `);
}

function initAppMetaTable(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

/** Daily competitor watcher rows (calendar date in `date_iso`, e.g. YYYY-MM-DD). */
export type CompetitorSignalRow = {
  id: number;
  competitor_name: string;
  source: string;
  url: string;
  date_iso: string;
  headline: string;
  summary: string;
};

export type CompetitorSignal = {
  id: number;
  competitorName: string;
  source: 'website' | 'facebook';
  url: string;
  dateIso: string;
  headline: string;
  summary: string;
};

function initCompetitorSignalsTable(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS competitor_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competitor_name TEXT NOT NULL,
      source TEXT NOT NULL,
      url TEXT NOT NULL,
      date_iso TEXT NOT NULL,
      headline TEXT NOT NULL,
      summary TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_competitor_signals_name_date ON competitor_signals(competitor_name, date_iso);
    CREATE INDEX IF NOT EXISTS idx_competitor_signals_date ON competitor_signals(date_iso);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_competitor_signals_unique_day
      ON competitor_signals(competitor_name, source, date_iso);
  `);
}

export function getMeta(key: string): string | null {
  const d = getDb();
  const row = d
    .prepare(`SELECT value FROM app_meta WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  const d = getDb();
  d.prepare(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

export function insertCompetitorSignal(signal: {
  competitorName: string;
  source: 'website' | 'facebook';
  url: string;
  dateIso: string;
  headline: string;
  summary: string;
}): number {
  const d = getDb();
  const r = d
    .prepare(
      `INSERT INTO competitor_signals (competitor_name, source, url, date_iso, headline, summary)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      signal.competitorName,
      signal.source,
      signal.url,
      signal.dateIso,
      signal.headline,
      signal.summary
    );
  return Number(r.lastInsertRowid);
}

/** Returns true if a row already exists for this competitor, source, and calendar day. */
export function hasCompetitorSignalForDay(
  competitorName: string,
  source: string,
  dateIso: string
): boolean {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT 1 AS ok FROM competitor_signals
       WHERE competitor_name = ? AND source = ? AND date_iso = ? LIMIT 1`
    )
    .get(competitorName, source, dateIso) as { ok: number } | undefined;
  return row !== undefined;
}

export async function listRecentCompetitorSignals(
  days: number
): Promise<CompetitorSignal[]> {
  const d = getDb();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(0, days));
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const rows = d
    .prepare(
      `SELECT id, competitor_name, source, url, date_iso, headline, summary
       FROM competitor_signals
       WHERE date_iso >= ?
       ORDER BY date_iso DESC, competitor_name ASC, source ASC`
    )
    .all(cutoffStr) as CompetitorSignalRow[];

  return rows.map((r) => ({
    id: r.id,
    competitorName: r.competitor_name,
    source: r.source as CompetitorSignal['source'],
    url: r.url,
    dateIso: r.date_iso,
    headline: r.headline,
    summary: r.summary
  }));
}

export function insertSupplierUpdate(params: {
  supplierName: string;
  dateIso: string;
  source: string;
  url: string;
  title: string;
  summary: string;
  tags: string[];
}): number {
  const d = getDb();
  const tagsJson = JSON.stringify(params.tags);
  const r = d
    .prepare(
      `INSERT INTO supplier_updates (supplier_name, date_iso, source, url, title, summary, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.supplierName,
      params.dateIso,
      params.source,
      params.url,
      params.title,
      params.summary,
      tagsJson
    );
  return Number(r.lastInsertRowid);
}

/** Avoid duplicate snapshot rows when `summarize_supplier_updates` runs multiple times per day. */
export function hasSupplierUpdateForDay(
  supplierName: string,
  source: string,
  dateIso: string
): boolean {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT 1 AS ok FROM supplier_updates
       WHERE supplier_name = ? AND source = ? AND date_iso = ? LIMIT 1`
    )
    .get(supplierName, source, dateIso) as { ok: number } | undefined;
  return row !== undefined;
}

export function listSupplierUpdatesSince(sinceIso: string): SupplierUpdateRow[] {
  const d = getDb();
  return d
    .prepare(
      `SELECT id, supplier_name, date_iso, source, url, title, summary, tags
       FROM supplier_updates
       WHERE date_iso >= ?
       ORDER BY date_iso DESC`
    )
    .all(sinceIso) as SupplierUpdateRow[];
}

export function getSupplierUpdatesByIds(ids: number[]): SupplierUpdateRow[] {
  const uniq = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  if (uniq.length === 0) return [];
  const d = getDb();
  const ph = uniq.map(() => '?').join(', ');
  return d
    .prepare(
      `SELECT id, supplier_name, date_iso, source, url, title, summary, tags
       FROM supplier_updates WHERE id IN (${ph})`
    )
    .all(...uniq) as SupplierUpdateRow[];
}

export function supplierUpdateRowToDto(row: SupplierUpdateRow): SupplierUpdate {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags) as string[];
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    supplierName: row.supplier_name,
    dateIso: row.date_iso,
    source: row.source as SupplierUpdate['source'],
    url: row.url,
    title: row.title,
    summary: row.summary,
    tags
  };
}

export function insertScheduledPost(params: {
  platform: string;
  runAtIsoUtc: string;
  caption: string;
  imageUrl: string;
}): number {
  const createdAt = new Date().toISOString();
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO scheduled_posts (platform, run_at, caption, image_url, status, error, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?)
  `);
  const r = stmt.run(
    params.platform,
    params.runAtIsoUtc,
    params.caption,
    params.imageUrl,
    createdAt,
    createdAt
  );
  return Number(r.lastInsertRowid);
}

/**
 * Rows due now: `run_at <= nowIso` and `status = 'pending'`.
 * Cancelled / posted / failed rows are never returned (scheduler skips them).
 */
export function getDuePosts(nowIso: string): ScheduledPostRow[] {
  const d = getDb();
  return d
    .prepare(
      `SELECT id, platform, run_at, caption, image_url, status, error, created_at, processing_started_at, updated_at
       FROM scheduled_posts
       WHERE status = 'pending' AND run_at <= ?
       ORDER BY run_at ASC`
    )
    .all(nowIso) as ScheduledPostRow[];
}

const nowIso = (): string => new Date().toISOString();

export function markPostStatus(
  id: number,
  status: ScheduledPostStatus,
  error?: string | null
): void {
  const d = getDb();
  d.prepare(
    `UPDATE scheduled_posts SET status = ?, error = ?, processing_started_at = NULL, updated_at = ? WHERE id = ?`
  ).run(status, error ?? null, nowIso(), id);
}

/** Atomically move `pending` → `processing` so concurrent ticks don’t double-publish. */
export function tryClaimPost(id: number): boolean {
  const started = nowIso();
  const d = getDb();
  const r = d
    .prepare(
      `UPDATE scheduled_posts
       SET status = 'processing', processing_started_at = ?, updated_at = ?
       WHERE id = ? AND status = 'pending'`
    )
    .run(started, started, id);
  return r.changes > 0;
}

/** JSON shape for `GET /api/scheduled-posts` (camelCase). */
export type ScheduledPostListItem = {
  id: number;
  platform: string;
  caption: string;
  mediaUrl: string;
  runAt: string;
  status: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string | null;
};

/** Newest `run_at` first among rows with `status = 'posted'` (for planner / performance summaries). */
export function listPostedScheduledPosts(limit = 50): ScheduledPostListItem[] {
  const d = getDb();
  const lim = Math.min(200, Math.max(1, Math.floor(limit)));
  const rows = d
    .prepare(
      `SELECT id, platform, run_at, caption, image_url, status, error, created_at, updated_at
       FROM scheduled_posts
       WHERE status = 'posted'
       ORDER BY run_at DESC
       LIMIT ?`
    )
    .all(lim) as Array<Omit<ScheduledPostRow, 'processing_started_at'>>;

  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    caption: r.caption,
    mediaUrl: r.image_url,
    runAt: r.run_at,
    status: r.status,
    lastError: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

/** Row shape for planner performance (posted queue items + optional Meta id for insights join). */
export type ScheduledPostForPlanner = {
  id: number;
  platform: string;
  caption: string;
  run_at: string;
  status: string;
  meta_post_id: string | null;
};

/**
 * Most recent `posted` scheduled rows (newest `run_at` first) with optional `meta_post_id`.
 * Used by `buildPlannerContext` to join `post_insights` via `getLatestPostInsightMetrics`.
 */
export function listRecentScheduledPostsWithMeta(
  limit: number
): ScheduledPostForPlanner[] {
  const d = getDb();
  const lim = Math.min(200, Math.max(1, Math.floor(limit)));
  const rows = d
    .prepare(
      `SELECT id, platform, run_at, caption, status, meta_post_id
       FROM scheduled_posts
       WHERE status = 'posted'
       ORDER BY run_at DESC
       LIMIT ?`
    )
    .all(lim) as Array<{
    id: number;
    platform: string;
    run_at: string;
    caption: string;
    status: string;
    meta_post_id: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    caption: r.caption,
    run_at: r.run_at,
    status: r.status,
    meta_post_id: r.meta_post_id ?? null
  }));
}

/** Newest `run_at` first. Includes all statuses (pending, processing, posted, failed, cancelled). */
export function listScheduledPosts(limit = 200): ScheduledPostListItem[] {
  const d = getDb();
  const rows = d
    .prepare(
      `SELECT id, platform, run_at, caption, image_url, status, error, created_at, updated_at
       FROM scheduled_posts
       ORDER BY run_at DESC
       LIMIT ?`
    )
    .all(limit) as Array<
    Omit<ScheduledPostRow, 'processing_started_at'>
  >;

  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    caption: r.caption,
    mediaUrl: r.image_url,
    runAt: r.run_at,
    status: r.status,
    lastError: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

export function getScheduledPostById(id: number): ScheduledPostRow | null {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT id, platform, run_at, caption, image_url, status, error, created_at, processing_started_at, updated_at
       FROM scheduled_posts WHERE id = ?`
    )
    .get(id) as ScheduledPostRow | undefined;
  return row ?? null;
}

/** Cancel a pending post. Returns false if not found or not pending. */
export function cancelScheduledPost(id: number): boolean {
  const d = getDb();
  const r = d
    .prepare(
      `UPDATE scheduled_posts
       SET status = 'cancelled', error = NULL, processing_started_at = NULL, updated_at = ?
       WHERE id = ? AND status = 'pending'`
    )
    .run(nowIso(), id);
  return r.changes > 0;
}

function initPostInsightsTable(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS post_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      post_id TEXT NOT NULL,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      captured_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_post_insights_post_platform
      ON post_insights(post_id, platform);
  `);
}

export type PostInsightRow = {
  id: number;
  platform: string;
  post_id: string;
  metric: string;
  value: number;
  captured_at: string;
};

export function insertPostInsight(insight: {
  platform: string;
  postId: string;
  metric: string;
  value: number;
  capturedAt: string;
}): number {
  const d = getDb();
  const r = d
    .prepare(
      `INSERT INTO post_insights (platform, post_id, metric, value, captured_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      insight.platform,
      insight.postId,
      insight.metric,
      insight.value,
      insight.capturedAt
    );
  return Number(r.lastInsertRowid);
}

/** Newest rows first; multiple rows per metric are allowed (history). */
export function listPostInsights(
  postId: string,
  platform: string
): PostInsightRow[] {
  const d = getDb();
  return d
    .prepare(
      `SELECT id, platform, post_id, metric, value, captured_at
       FROM post_insights
       WHERE post_id = ? AND platform = ?
       ORDER BY captured_at DESC`
    )
    .all(postId, platform) as PostInsightRow[];
}

/** Latest value per metric name for a post (by most recent captured_at). */
export function getLatestPostInsightMetrics(
  postId: string,
  platform: string
): Record<string, number> {
  const rows = listPostInsights(postId, platform);
  const seen = new Set<string>();
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (seen.has(r.metric)) continue;
    seen.add(r.metric);
    out[r.metric] = r.value;
  }
  return out;
}

/** Distinct Meta posts that have at least one insight row, newest activity first. */
export type InsightPostKeyRow = {
  platform: string;
  post_id: string;
  last_captured_at: string;
};

export function listDistinctInsightPosts(params: {
  platform: 'facebook' | 'instagram' | 'all';
  limit: number;
}): InsightPostKeyRow[] {
  const d = getDb();
  const lim = Math.min(200, Math.max(1, Math.floor(params.limit)));
  if (params.platform === 'all') {
    return d
      .prepare(
        `SELECT platform, post_id, MAX(captured_at) AS last_captured_at
         FROM post_insights
         GROUP BY platform, post_id
         ORDER BY MAX(captured_at) DESC
         LIMIT ?`
      )
      .all(lim) as InsightPostKeyRow[];
  }
  return d
    .prepare(
      `SELECT platform, post_id, MAX(captured_at) AS last_captured_at
       FROM post_insights
       WHERE platform = ?
       GROUP BY platform, post_id
       ORDER BY MAX(captured_at) DESC
       LIMIT ?`
    )
    .all(params.platform, lim) as InsightPostKeyRow[];
}

/**
 * draft_posts.status: draft | approved | rejected | scheduled
 * scheduled_post_id set when promoted to scheduled_posts.
 */
function migrateDraftPostsSchema(d: Database.Database): void {
  const cols = d
    .prepare(`PRAGMA table_info(draft_posts)`)
    .all() as { name: string }[];
  if (cols.length === 0) return;
  const names = new Set(cols.map((c) => c.name));
  if (names.has('platforms') && names.has('created_by')) return;
  if (names.has('platform') && !names.has('platforms')) {
    d.exec(`ALTER TABLE draft_posts ADD COLUMN platforms TEXT`);
    d.exec(
      `UPDATE draft_posts SET platforms = '["' || platform || '"]' WHERE platforms IS NULL OR platforms = ''`
    );
  }
  if (!names.has('created_by')) {
    d.exec(`ALTER TABLE draft_posts ADD COLUMN created_by TEXT DEFAULT 'manual'`);
    d.exec(`UPDATE draft_posts SET created_by = 'manual' WHERE created_by IS NULL OR created_by = ''`);
  }
  if (!names.has('source_json')) {
    d.exec(`ALTER TABLE draft_posts ADD COLUMN source_json TEXT NULL`);
  }
  if (!names.has('scheduled_post_id')) {
    d.exec(`ALTER TABLE draft_posts ADD COLUMN scheduled_post_id INTEGER NULL`);
  }
}

function initDraftPostsTable(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS draft_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      caption TEXT NOT NULL,
      image_url TEXT NULL,
      platforms TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      scheduled_post_id INTEGER NULL,
      source_json TEXT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_draft_posts_status ON draft_posts(status);
  `);
  migrateDraftPostsSchema(d);
}

export type DraftPostRow = {
  id: number;
  caption: string;
  image_url: string | null;
  platforms: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  scheduled_post_id: number | null;
  source_json: string | null;
};

export function insertDraftPost(params: {
  caption: string;
  imageUrl: string | null;
  platforms: string[];
  createdBy: string;
  sourceJson: string | null;
}): number {
  const d = getDb();
  const t = nowIso();
  const platformsJson = JSON.stringify(params.platforms);
  const r = d
    .prepare(
      `INSERT INTO draft_posts (
         caption, image_url, platforms, status, created_by, created_at, updated_at, scheduled_post_id, source_json
       ) VALUES (?, ?, ?, 'draft', ?, ?, ?, NULL, ?)`
    )
    .run(
      params.caption,
      params.imageUrl,
      platformsJson,
      params.createdBy,
      t,
      t,
      params.sourceJson
    );
  return Number(r.lastInsertRowid);
}

export function countDraftsCreatedTodayBySource(createdByPrefix: string): number {
  const d = getDb();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const row = d
    .prepare(
      `SELECT COUNT(*) AS cnt FROM draft_posts
       WHERE created_by LIKE ? AND created_at >= ?`
    )
    .get(`${createdByPrefix}%`, todayStart.toISOString()) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

/** Omit `statuses` or pass an empty array to return all drafts (newest `updated_at` first). */
export function listDraftPosts(statuses?: string[]): DraftPostRow[] {
  const d = getDb();
  if (statuses && statuses.length > 0) {
    const ph = statuses.map(() => '?').join(', ');
    return d
      .prepare(
        `SELECT id, caption, image_url, platforms, status, created_by, created_at, updated_at, scheduled_post_id, source_json
         FROM draft_posts
         WHERE status IN (${ph})
         ORDER BY updated_at DESC`
      )
      .all(...statuses) as DraftPostRow[];
  }
  return d
    .prepare(
      `SELECT id, caption, image_url, platforms, status, created_by, created_at, updated_at, scheduled_post_id, source_json
       FROM draft_posts
       ORDER BY updated_at DESC`
    )
    .all() as DraftPostRow[];
}

export function getDraftPostById(id: number): DraftPostRow | null {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT id, caption, image_url, platforms, status, created_by, created_at, updated_at, scheduled_post_id, source_json
       FROM draft_posts WHERE id = ?`
    )
    .get(id) as DraftPostRow | undefined;
  return row ?? null;
}

export function updateDraftPostStatus(
  id: number,
  status: string,
  options?: { rejectionReason?: string }
): boolean {
  const existing = getDraftPostById(id);
  if (!existing) return false;
  if (existing.status !== 'draft') return false;
  const t = nowIso();
  let newSource = existing.source_json;
  if (status === 'rejected' && options?.rejectionReason !== undefined) {
    let base: Record<string, unknown> = {};
    try {
      if (existing.source_json) {
        base = JSON.parse(existing.source_json) as Record<string, unknown>;
      }
    } catch {
      base = { _unparsedSource: existing.source_json };
    }
    base.rejectionReason = options.rejectionReason;
    newSource = JSON.stringify(base);
  }
  const d = getDb();
  d.prepare(
    `UPDATE draft_posts SET status = ?, updated_at = ?, source_json = ? WHERE id = ?`
  ).run(status, t, newSource, id);
  return true;
}

export function linkDraftToScheduledPost(
  draftId: number,
  scheduledId: number
): void {
  const d = getDb();
  const r = d
    .prepare(
      `UPDATE draft_posts
       SET scheduled_post_id = ?, status = 'scheduled', updated_at = ?
       WHERE id = ? AND status = 'approved'`
    )
    .run(scheduledId, nowIso(), draftId);
  if (r.changes === 0) {
    throw new Error('draft not found or not approved');
  }
}

/** JSON for admin `GET /api/draft-posts` (camelCase). */
export type DraftPostListItem = {
  id: number;
  createdAt: string;
  platforms: string[];
  caption: string;
  imageUrl: string | null;
  status: string;
  updatedAt: string;
};

export function draftPostRowToListItem(row: DraftPostRow): DraftPostListItem {
  let platforms: string[] = [];
  try {
    platforms = JSON.parse(row.platforms) as string[];
  } catch {
    platforms = [];
  }
  return {
    id: row.id,
    createdAt: row.created_at,
    platforms,
    caption: row.caption,
    imageUrl: row.image_url,
    status: row.status,
    updatedAt: row.updated_at
  };
}

/**
 * List drafts for the admin UI. `status` defaults to `draft` at the HTTP layer; use `all` for every status.
 */
export function listDraftPostsForAdmin(params: {
  status: string;
  limit?: number;
}): DraftPostListItem[] {
  const lim = Math.min(500, Math.max(1, Math.floor(params.limit ?? 500)));
  const rows =
    params.status === 'all'
      ? (listDraftPosts(undefined).slice(0, lim) as DraftPostRow[])
      : (listDraftPosts([params.status]).slice(0, lim) as DraftPostRow[]);
  return rows.map(draftPostRowToListItem);
}

function initEmailAttachmentsTextTable(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS email_attachments_text (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_name TEXT NOT NULL DEFAULT '',
      filename TEXT NOT NULL UNIQUE,
      content_type TEXT NOT NULL,
      text TEXT NOT NULL,
      extracted_at TEXT NOT NULL
    );
  `);
}

export function hasEmailAttachmentText(filename: string): boolean {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT 1 AS ok FROM email_attachments_text WHERE filename = ? LIMIT 1`
    )
    .get(filename) as { ok: number } | undefined;
  return row !== undefined;
}

export function insertEmailAttachmentText(params: {
  supplierName: string;
  filename: string;
  contentType: string;
  text: string;
}): number {
  const d = getDb();
  const extractedAt = new Date().toISOString();
  const r = d
    .prepare(
      `INSERT INTO email_attachments_text (supplier_name, filename, content_type, text, extracted_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(filename) DO UPDATE SET
         supplier_name = excluded.supplier_name,
         content_type = excluded.content_type,
         text = excluded.text,
         extracted_at = excluded.extracted_at`
    )
    .run(
      params.supplierName,
      params.filename,
      params.contentType,
      params.text,
      extractedAt
    );
  return Number(r.lastInsertRowid);
}

// ---------------------------------------------------------------------------
// error_log table
// ---------------------------------------------------------------------------

function initErrorLogTable(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS error_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

export function insertErrorLog(source: string, message: string, detail?: string): number {
  const d = getDb();
  const r = d
    .prepare(
      `INSERT INTO error_log (source, message, detail, created_at) VALUES (?, ?, ?, ?)`,
    )
    .run(source, message, detail ?? null, new Date().toISOString());
  return Number(r.lastInsertRowid);
}

export function listErrorLog(limit = 200): Array<{
  id: number;
  source: string;
  message: string;
  detail: string | null;
  createdAt: string;
}> {
  const d = getDb();
  const rows = d
    .prepare(`SELECT id, source, message, detail, created_at FROM error_log ORDER BY id DESC LIMIT ?`)
    .all(limit) as Array<{
      id: number;
      source: string;
      message: string;
      detail: string | null;
      created_at: string;
    }>;
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    message: r.message,
    detail: r.detail,
    createdAt: r.created_at,
  }));
}

export function clearErrorLog(): void {
  const d = getDb();
  d.exec(`DELETE FROM error_log`);
}

// ---------------------------------------------------------------------------
// reschedule a pending post to a new date/time
// ---------------------------------------------------------------------------

export function reschedulePost(id: number, newRunAt: string): boolean {
  const d = getDb();
  const r = d
    .prepare(`UPDATE scheduled_posts SET run_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'`)
    .run(newRunAt, new Date().toISOString(), id);
  return r.changes > 0;
}

// TODO: optional periodic DELETE for old posted/failed rows to cap DB size.
