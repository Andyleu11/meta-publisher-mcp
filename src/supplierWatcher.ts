/**
 * Supplier “update watcher” — first-pass **heuristic** public HTML snapshots (websites + social profile URLs).
 *
 * HEURISTIC / LIMITATIONS (read before tuning per supplier):
 * - Only **unauthenticated** pages are fetched. No logins, no private or gated content.
 * - **JavaScript-rendered** sites (most Facebook/Instagram feeds) expose little in raw HTML — titles/meta
 *   may be generic; post text is often missing. This is expected; treat output as a weak signal, not a feed reader.
 * - **Rate limiting**: one request per supplier URL per calendar day (deduped via `hasSupplierUpdateForDay`);
 *   delay between requests; short timeout; polite User-Agent.
 * - **Compliance**: respect Terms of Use / robots.txt in production; for inspiration only — do not republish
 *   supplier copy verbatim where restricted.
 *
 * Parsing helpers mirror the approach in `competitorScraper.ts` (regex + string ops, no DOM execution).
 */

import { fetch } from 'undici';
import { loadSuppliers } from './supplierLoader.js';
import { storeSupplierUpdate } from './supplierSources.js';
import { hasSupplierUpdateForDay } from './db.js';
import type { SupplierUpdate } from './supplierTypes.js';

const USER_AGENT =
  'meta-publisher-mcp/0.1 (supplier public snapshot; contact: local admin)';
const FETCH_TIMEOUT_MS = 20_000;
const DELAY_BETWEEN_REQUESTS_MS = 2_500;

/** Supplier scans run unless explicitly disabled (network opt-out). */
function scrapingEnabled(): boolean {
  return process.env.SCRAPING_ENABLED !== 'false';
}

function todayDateIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html: string): string {
  return decodeBasicEntities(html.replace(/<[^>]+>/g, ' '));
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return decodeBasicEntities(stripTags(m[1]));
}

function extractHeadings(html: string, max = 4): string[] {
  const out: string[] = [];
  const re = /<h([12])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < max) {
    const t = decodeBasicEntities(stripTags(m[2]));
    if (t.length > 0) out.push(t);
  }
  return out;
}

/** First `<h1>` or `<h2>` in document order (regex best-effort). */
function extractFirstHeadingLevel(html: string, level: 1 | 2): string | null {
  const re = new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, 'gi');
  const m = re.exec(html);
  if (!m) return null;
  const t = decodeBasicEntities(stripTags(m[1]));
  return t.length > 0 ? t : null;
}

function extractMetaDescription(html: string): string | null {
  const og = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i
  );
  if (og?.[1]) return decodeBasicEntities(og[1]);
  const md = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
  );
  if (md?.[1]) return decodeBasicEntities(md[1]);
  return null;
}

function extractOgTitle(html: string): string | null {
  const m = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i
  );
  if (!m?.[1]) return null;
  return decodeBasicEntities(m[1]);
}

/** Very naive Facebook “post” hint — often empty for JS-rendered pages. */
function extractFacebookSnippet(html: string): string | null {
  const story = html.match(/userContent[^>]{0,200}>([\s\S]{20,800}?)<\/div>/i);
  if (story?.[1]) {
    const t = decodeBasicEntities(stripTags(story[1])).slice(0, 400);
    if (t.length > 40) return t;
  }
  return extractMetaDescription(html);
}

function extractInstagramOgDescription(html: string): string | null {
  const m = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i
  );
  if (m?.[1]) return decodeBasicEntities(m[1]);
  return null;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.9'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function buildWebsiteTitleSummary(
  html: string,
  supplierName: string
): { title: string; summary: string } {
  const pageTitle = extractTitle(html);
  const ogTitle = extractOgTitle(html);
  const h1 = extractFirstHeadingLevel(html, 1);
  const h2 = extractFirstHeadingLevel(html, 2);
  const desc = extractMetaDescription(html);

  const title = (
    pageTitle ??
    ogTitle ??
    h1 ??
    `Home — ${supplierName}`
  ).slice(0, 300);

  const parts: string[] = [];
  if (h1) parts.push(`H1: ${h1}`);
  if (h2) parts.push(`H2: ${h2}`);
  if (!h1 && !h2) {
    const any = extractHeadings(html, 2);
    if (any[0]) parts.push(any[0]);
  }
  if (desc) parts.push(desc);
  if (parts.length === 0 && pageTitle) {
    parts.push(`Page title: ${pageTitle}`);
  }
  let summary = parts.join(' · ').slice(0, 600);
  if (summary.length < 40) {
    summary =
      `Heuristic snapshot of ${supplierName} public website. Many sites load content with JavaScript; ` +
      `this row may be thin until per-site tuning.`;
  }
  return { title, summary };
}

function buildFacebookTitleSummary(
  html: string,
  supplierName: string
): { title: string; summary: string } {
  const ogTitle = extractOgTitle(html);
  const titleTag = extractTitle(html);
  const snippet = extractFacebookSnippet(html);
  const title = (ogTitle ?? titleTag ?? `Facebook — ${supplierName}`).slice(0, 300);
  let summary =
    snippet ??
    'Facebook page (static HTML only; feed often JS-rendered).';
  if (summary.length > 600) summary = summary.slice(0, 597) + '...';
  return { title, summary };
}

function buildInstagramTitleSummary(
  html: string,
  supplierName: string
): { title: string; summary: string } {
  const ogTitle = extractOgTitle(html);
  const titleTag = extractTitle(html);
  const ogDesc = extractInstagramOgDescription(html);
  const title = (ogTitle ?? titleTag ?? `Instagram — ${supplierName}`).slice(0, 300);
  let summary =
    ogDesc ??
    extractMetaDescription(html) ??
    'Instagram profile (public HTML; grid often JS-rendered).';
  if (summary.length > 600) summary = summary.slice(0, 597) + '...';
  return { title, summary };
}

function instagramHandleToUrl(handle: string): string | null {
  const h = handle.trim();
  if (!h) return null;
  if (h.startsWith('http://') || h.startsWith('https://')) return h;
  return `https://www.instagram.com/${h.replace(/^@/, '')}/`;
}

let requestSeq = 0;

async function throttle(): Promise<void> {
  if (requestSeq++ > 0) await sleep(DELAY_BETWEEN_REQUESTS_MS);
}

/**
 * `lookbackDays` is reserved for future filtering (e.g. skip stale re-snapshots). Inserts use **today’s**
 * calendar date in `date_iso` so rows appear in the lookback window when `summarize_supplier_updates` runs.
 */
export async function scanSupplierWebsites(
  _lookbackDays?: number
): Promise<SupplierUpdate[]> {
  void _lookbackDays;
  const out: SupplierUpdate[] = [];
  if (!scrapingEnabled()) {
    return out;
  }

  const suppliers = loadSuppliers().filter(
    (s) => s.allowScrape && s.website.trim().length > 0
  );
  const dateIso = todayDateIsoUtc();

  for (const s of suppliers) {
    if (hasSupplierUpdateForDay(s.name, 'website', dateIso)) {
      continue;
    }
    await throttle();
    const html = await fetchHtml(s.website.trim());
    if (!html) {
      console.warn(`[supplierWatcher] website fetch failed: ${s.name}`);
      continue;
    }
    const { title, summary } = buildWebsiteTitleSummary(html, s.name);
    const id = await storeSupplierUpdate({
      supplierName: s.name,
      dateIso,
      source: 'website',
      url: s.website.trim(),
      title,
      summary,
      tags: []
    });
    out.push({
      id,
      supplierName: s.name,
      dateIso,
      source: 'website',
      url: s.website.trim(),
      title,
      summary,
      tags: []
    });
  }

  return out;
}

/**
 * `lookbackDays` reserved for parity with `scanSupplierWebsites` / future throttling; inserts use
 * today’s calendar `date_iso` (deduped per supplier + source + day).
 */
export async function scanSupplierSocials(
  _lookbackDays?: number
): Promise<SupplierUpdate[]> {
  void _lookbackDays;
  const out: SupplierUpdate[] = [];
  if (!scrapingEnabled()) {
    return out;
  }

  const suppliers = loadSuppliers().filter(
    (s) =>
      s.allowScrape &&
      (s.facebookPageUrl.trim().length > 0 ||
        s.instagramHandle.trim().length > 0)
  );
  const dateIso = todayDateIsoUtc();

  for (const s of suppliers) {
    const fbUrl = s.facebookPageUrl.trim();
    if (fbUrl) {
      if (!hasSupplierUpdateForDay(s.name, 'facebook', dateIso)) {
        await throttle();
        const html = await fetchHtml(fbUrl);
        if (html) {
          const { title, summary } = buildFacebookTitleSummary(html, s.name);
          const id = await storeSupplierUpdate({
            supplierName: s.name,
            dateIso,
            source: 'facebook',
            url: fbUrl,
            title,
            summary,
            tags: []
          });
          out.push({
            id,
            supplierName: s.name,
            dateIso,
            source: 'facebook',
            url: fbUrl,
            title,
            summary,
            tags: []
          });
        } else {
          console.warn(`[supplierWatcher] facebook fetch failed: ${s.name}`);
        }
      }
    }

    const igUrl = instagramHandleToUrl(s.instagramHandle);
    if (igUrl) {
      if (!hasSupplierUpdateForDay(s.name, 'instagram', dateIso)) {
        await throttle();
        const html = await fetchHtml(igUrl);
        if (html) {
          const { title, summary } = buildInstagramTitleSummary(html, s.name);
          const id = await storeSupplierUpdate({
            supplierName: s.name,
            dateIso,
            source: 'instagram',
            url: igUrl,
            title,
            summary,
            tags: []
          });
          out.push({
            id,
            supplierName: s.name,
            dateIso,
            source: 'instagram',
            url: igUrl,
            title,
            summary,
            tags: []
          });
        } else {
          console.warn(`[supplierWatcher] instagram fetch failed: ${s.name}`);
        }
      }
    }
  }

  return out;
}
