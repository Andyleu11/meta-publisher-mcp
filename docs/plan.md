# Meta Publisher MCP – Implementation Plan

## Phase 1 – Core Skeleton
- [x] **MCP bootstrap** — `McpServer` + `StdioServerTransport` + `connect` (required for `npm run dev` and MCP clients).
- [x] **`graphPost`** — HTTP status + JSON body handling; throw on Graph `error` object (including HTTP 200 error payloads).
- [x] **Photo helpers** — Page `POST /{page-id}/photos` (`url`, `caption`, optional `published`); Instagram container + `media_publish` per Content Publishing docs.
- [x] **Config** — Graph API version from `META_GRAPH_API_VERSION` (default `v21.0`) in `src/config.ts`; base URL built in `metaClient.ts`.
- [x] **Verify** — `npm run build` succeeds.

## Phase 2 – MCP Tools (Organic)
- [x] **Organic posting** — `post_facebook_photo` / `post_instagram_photo` with Graph errors surfaced via MCP `isError` + message; Instagram uses container → optional status poll → `media_publish` (`src/metaClient.ts`).
- [x] **`schedule_post` + SQLite** — `insertScheduledPost`, `data/meta-publisher.db`, in-process `setInterval` worker (`src/scheduler.ts`, `src/db.ts`).
- [x] **Draft layer** — `draft_posts` table; MCP `create_draft_post`, `list_draft_posts`, `update_draft_post_status`, `schedule_draft_post`; promotion via `promoteDraftToScheduled` in `src/draftsService.ts` (approved draft → `scheduled_posts`, draft status `scheduled`). Does not auto-post to Meta.
- [ ] Optional: prune old `posted` rows; handle `both` partial failure (see TODO in `scheduler.ts`).
- [x] **Stuck `processing`** — `processing_started_at` + startup reset + `reclaimStaleProcessing` (`SCHEDULER_STALE_PROCESSING_MS`).
- [x] **HTTP health** — `src/healthServer.ts` (Express, `GET /`, **`GET /admin`** admin index, `GET /health`); run via `npm run dev:health` / `npm run start:health` after build.
- [x] **Admin index** — `public/admin-index.html` at **`/admin`**; short aliases **`/admin-scheduled-posts`**, **`/admin-competitor-insights`**, **`/admin-post-performance`** (same HTML as `/admin/…` routes). Subpages link back to **`/admin`**.
- [x] **Brand rules + checks** — `config/brand-rules.json` + `src/brandRules.ts`; **`src/brandRulesCheck.ts`** warns on competitor names (`competitors.json`), long verbatim chunks vs supplier/email context in `source_json` (incl. `supplierUpdateIds` → `supplier_updates`), near-duplicate captions, repeated `imageUrl`, and unknown **`imageUrl`** vs **`data/assets-manifest.json`**. Surfaces as **`brandWarnings`** on `create_draft_post` / `list_draft_posts` and **`/api/draft-posts`** (admin drafts UI).

**Instagram (planner):** Feed assets 4:5 preferred; short line-broken captions and hashtag mix — see `docs/weekly-content-planning-prompt.md` (Platform notes).

## Phase 3 – Marketing API (Paid)
- [x] **createAdSetLocal** — Marketing API ad set with `custom_locations` (Brisbane CBD, Redlands/Capalaba, Logan Central), `radiusKm` per pin, `location_types` home/recent; ad set `PAUSED` by default.
- [ ] **Interests targeting** — After targeting search, add interests (e.g. home improvement, homeowners) in `createAdSetLocal` (see TODO in `metaClient.ts`).
- [ ] Implement createAdFromCreative and flow from organic post -> creative -> ad.
- [ ] Add safety caps for budget (beyond PAUSED default).

## Phase 4b – Competitive insights (skeleton)
- [x] **`competitors.json`**, **`src/competitorScraper.ts`** (policy comments, `runDailyCompetitorScrape`, `buildStubCompetitorReport`).
- [x] **MCP** — `generate_competitor_report` in `src/tools/competitiveInsightsTools.ts` (uses shared **`buildCompetitorReport()`** in `src/competitorReport.ts`).
- [x] **Scraper + scheduler** — `runDailyCompetitorScrape()` when `SCRAPING_ENABLED=true`; **`startCompetitorScrapeScheduler()`** in `src/scheduler.ts` (≈24h) writes to SQLite **`competitor_signals`**.
- [x] **Admin (HTTP only, not MCP)** — **`GET /admin/competitor-insights`** serves `public/admin-competitor-insights.html`; **`GET /api/competitor-report?lookbackDays=...`** returns the same grouped JSON as `generate_competitor_report` (read-only signals: date, source, headline, summary, URL per competitor).
- [ ] Ingest signals → richer analysis pass; planner prompt line: use latest report; never name competitors in outbound posts.

## Phase 4c – Supplier content sources (skeleton)
- [x] **`suppliers.json`** + **`flooring-suppliers.CSV`**, `npm run gen:suppliers` — names from CSV; web/socials via manual or assisted lookup (`docs/supplier-content-sources.md`); **`emailDomains`** for email routing; **`allowScrape`** / **`allowEmailContent`** kill-switches.
- [x] **`supplier_updates`** SQLite table + **`storeSupplierUpdate`** / **`listSupplierUpdatesSince`**; **`supplierWatcher.ts`** (stubs); MCP **`ingest_supplier_email`**, **`summarize_supplier_updates`** (reads DB + stub scans).
- [x] **HTTP email upload** — `POST /api/upload-email`, `mailparser` `.eml` parse, `public/supplier-email-upload.html` (health server).
- [x] **`.msg` parsing (best-effort)** — `@kenjiuno/msgreader` in `src/utils/parseEmailFile.ts`; failures return a clear error; ingestion otherwise unchanged.
- [x] **PDF attachment text (basic)** — `pdf-parse` via `extractTextFromAttachment`, table `email_attachments_text`, upload hook for small PDFs, `npm run extract:attachments` backfill. **No OCR** (image PDFs / scans empty until future work).
- [ ] Website + social watchers; richer NLP; OCR for PDFs/images; feed weekly planner (see `docs/supplier-planning-and-voice.md`; user-approved only).

## Insights & feedback loop
- [x] **`post_insights` SQLite table** — `initSchema` creates `post_insights`; helpers `insertPostInsight`, `listPostInsights`, `getLatestPostInsightMetrics`, `listDistinctInsightPosts` (`src/db.ts`).
- [x] **Graph helpers** — `getFacebookPostInsights` / `getInstagramMediaInsights` in `src/metaClient.ts`: basic metrics **impressions, reach, engagement** (Facebook maps `post_impressions` / `post_impressions_unique` / `post_engaged_users`); timeouts + retry on rate limits.
- [x] **MCP `get_post_insights`** — inputs `platform`, `postIds[]`, `refresh`; calls the Graph API (unless a full cached snapshot exists), then stores rows in `post_insights` (`src/tools/insightsTools.ts`). **Metrics in the DB and on this page come from that tool + table**, not from live Graph calls in the health server.
- [x] **Admin: Post performance (HTTP only)** — **`GET /admin/post-performance`** serves `public/admin-post-performance.html`; **`GET /api/post-performance?platform=all|facebook|instagram&limit=50`** returns recent distinct Meta posts that have insight rows, with latest **impressions / reach / engagement** per post. Linked from the health **`/`** index.
- [ ] Persist Meta post/media IDs (and optional `posted_at`) on `scheduled_posts` after publish so this page can show local **id**, **caption**, and schedule/post timestamps instead of nulls.

## Planner context
- [x] **`get_planner_context`** (MCP) — **`src/tools/plannerTools.ts`** + **`src/plannerContext.ts`** (`buildPlannerContext`). This is the **single entry point** AI agents should call before generating draft post ideas: one tool instead of chaining multiple reads.

**Bundled data (read-only):**
- **`competitorSignals`** — from SQLite **`competitor_signals`** via **`listRecentCompetitorSignals`** (HTML snapshot signals; lookback in days).
- **`supplierUpdates`** — from **`supplier_updates`** via **`listSupplierUpdatesSince`** (same family of rows as **`summarize_supplier_updates`**).
- **`recentPerformance`** — recent **`posted`** rows from **`scheduled_posts`** via **`listRecentScheduledPostsWithMeta`**, joined to cached **`post_insights`** with **`getLatestPostInsightMetrics`** when **`meta_post_id`** is set (otherwise metrics are empty until IDs are persisted after publish).
- **`availableAssets`** — from in-memory cache of **`data/assets-manifest.json`** (`manifestScanRoot`, `count`, `sampleRels[]`). Full list + optional `filter`: use MCP **`list_available_assets`** (`src/tools/assetTools.ts`).

**JSON shape:** top-level includes `generatedAt`, `lookbackDays`, `competitorSignals[]`, `supplierUpdates[]`, `recentPerformance[]`, `planningReminders`, `availableAssets`. Each **`recentPerformance`** item includes `scheduledPostId`, `platform`, `captionPreview`, `runAtIso`, `metaPostId`, and `metrics` (`impressions`, `reach`, `engagement` when present).

**Important:** This tool does **not** create or schedule posts; it is read-only and intended for planning.

## Asset manifest
- **File:** **`data/assets-manifest.json`** (gitignored by default). Built by **`scripts/hash-image-assets.mjs`** from a folder of images on disk.
- **Refresh:** from the project root, run (use a **real** folder path — not a placeholder):  
  `node scripts/hash-image-assets.mjs "C:/Dev/SocialAI/Advertising & Social Media Content"`  
  Optional perceptual hashes: `USE_PHASH=1 node scripts/hash-image-assets.mjs "..."`  
  Console prints `Wrote N assets to data/assets-manifest.json`.  
  If the path is missing or **no images** are found, the script **exits with an error and does not overwrite** the existing manifest (use `ALLOW_EMPTY_MANIFEST=1` only if you intentionally want an empty file).
- **Load:** **`loadAssetManifest()`** in **`src/assetLoader.ts`** runs at **MCP** (`src/index.ts`) and **health server** (`src/healthServer.ts`) startup. Missing or invalid JSON logs a warning and uses an empty list (process does not exit).
- **Planner reference:** MCP **`list_available_assets`** returns `{ manifestScanRoot, filter, count, items[] }` with `{ rel, sha256, phash? }` per row — use these paths (or basename) for **`create_draft_post`** `imageUrl` when using local filenames.
- **Validation:** **`checkDraftCaption`** adds **`asset_not_found`** to **`brandWarnings`** when `imageUrl` is set but does not match any manifest `rel` (skipped if the manifest is empty or `imageUrl` is omitted).

## Phase 4 – Integration & Docs
- [x] **Weekly content prompt** — Master A to Z weekly planner copy-paste text in `docs/weekly-content-planning-prompt.md` (includes MCP alignment notes, Instagram platform notes).
- [x] **README** — Health check commands (`dev:health`, `start:health`) and Instagram env/permissions pointers.
- [ ] Document full tool schemas & example calls in README (beyond health + IG).
- [ ] Add simple CLI or script to test tools without an AI client.
