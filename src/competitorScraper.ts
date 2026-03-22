import 'dotenv/config';

/**
 * Competitive insights — minimal public HTML fetch (best-effort).
 *
 * LEGAL / ETHICAL (AU): encode policy here and in config before any real crawling.
 * - Only public content. No logins, gated portals, or PII.
 * - Respect robots.txt and site Terms of Use; skip sites that forbid automated access.
 * - Throttle heavily (e.g. ≤1 pass per competitor per day); polite User-Agent; backoff on errors.
 * - Store only high-level marketing signals (offer types, product terms, timestamps, counts)—not personal data.
 * - Reporting / inspiration only: do not auto-republish or copy competitor copy verbatim.
 *
 * IMPLEMENTATION NOTE: This uses simple static HTML parsing only (regex + string ops). It does not execute
 * JavaScript; many sites (including Facebook) render most content client-side, so headlines/snippets may be
 * incomplete or generic. Treat all extracted text as best-effort signals, not a complete picture.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { fetch } from 'undici';
import {
  hasCompetitorSignalForDay,
  insertCompetitorSignal
} from './db.js';

export type CompetitorEntry = {
  name: string;
  website: string | null;
  facebookPageUrl: string | null;
  instagramHandle: string | null;
  /** When false, skip any HTTP fetch for this row. */
  allowScrape: boolean;
  region?: string;
  notes?: Record<string, string>;
};

const USER_AGENT =
  'meta-publisher-mcp/0.1 (competitor signal snapshot; contact: local admin)';
const FETCH_TIMEOUT_MS = 20_000;
const DELAY_BETWEEN_COMPETITORS_MS = 2_500;

export function loadCompetitors(): CompetitorEntry[] {
  const file = join(process.cwd(), 'competitors.json');
  if (!existsSync(file)) {
    return [];
  }
  const raw = readFileSync(file, 'utf8');
  return JSON.parse(raw) as CompetitorEntry[];
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

/** Extract `<title>` text (first match). */
function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return decodeBasicEntities(stripTags(m[1]));
}

/** First few `<h1>` / `<h2>` inner texts (lightweight; nested tags flattened). */
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

/** Open Graph or meta description (best-effort). */
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

/**
 * Very naive "first post" hint: look for data-ft or userContentWrapper adjacent text (often empty for FB).
 */
function extractFacebookSnippet(html: string): string | null {
  const story = html.match(/userContent[^>]{0,200}>([\s\S]{20,800}?)<\/div>/i);
  if (story?.[1]) {
    const t = decodeBasicEntities(stripTags(story[1])).slice(0, 400);
    if (t.length > 40) return t;
  }
  return extractMetaDescription(html);
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

function buildWebsiteSignal(
  competitorName: string,
  url: string,
  html: string
): { headline: string; summary: string } {
  const title = extractTitle(html);
  const og = extractOgTitle(html);
  const headings = extractHeadings(html);
  const desc = extractMetaDescription(html);

  const headlineBits = [title, og].filter(Boolean) as string[];
  const headline =
    headlineBits[0] ??
    headings[0] ??
    `Home page (${competitorName})`;

  const parts: string[] = [];
  if (title) parts.push(`Title: ${title}.`);
  if (headings.length) parts.push(`Headings: ${headings.join(' · ')}.`);
  if (desc) parts.push(`Description: ${desc}`);
  let summary = parts.join(' ');
  if (summary.length < 20) {
    summary = `Best-effort snapshot from public HTML for ${competitorName}.`;
  }
  if (summary.length > 600) summary = summary.slice(0, 597) + '...';
  return { headline: headline.slice(0, 300), summary };
}

function buildFacebookSignal(
  competitorName: string,
  url: string,
  html: string
): { headline: string; summary: string } {
  const ogTitle = extractOgTitle(html);
  const title = extractTitle(html);
  const snippet = extractFacebookSnippet(html);
  const headline = ogTitle ?? title ?? `Facebook page (${competitorName})`;
  let summary =
    snippet ??
    'Best-effort: Facebook often loads content with JavaScript; only static meta/title may be visible.';
  if (summary.length > 600) summary = summary.slice(0, 597) + '...';
  return { headline: headline.slice(0, 300), summary };
}

export async function runDailyCompetitorScrape(): Promise<{
  ok: boolean;
  message: string;
  websiteInserted: number;
  facebookInserted: number;
  skipped: number;
}> {
  const enabled = process.env.SCRAPING_ENABLED === 'true';
  if (!enabled) {
    return {
      ok: false,
      message:
        'SCRAPING_ENABLED is not true — no network requests. Set explicitly when policy + implementation are ready.',
      websiteInserted: 0,
      facebookInserted: 0,
      skipped: 0
    };
  }

  const list = loadCompetitors();
  const allowed = list.filter((c) => c.allowScrape);
  const dateIso = todayDateIsoUtc();
  let websiteInserted = 0;
  let facebookInserted = 0;
  let skipped = 0;

  for (let i = 0; i < allowed.length; i++) {
    const c = allowed[i];
    if (i > 0) await sleep(DELAY_BETWEEN_COMPETITORS_MS);

    if (c.website) {
      if (hasCompetitorSignalForDay(c.name, 'website', dateIso)) {
        skipped += 1;
      } else {
        const html = await fetchHtml(c.website);
        if (html) {
          const { headline, summary } = buildWebsiteSignal(c.name, c.website, html);
          insertCompetitorSignal({
            competitorName: c.name,
            source: 'website',
            url: c.website,
            dateIso,
            headline,
            summary
          });
          websiteInserted += 1;
        }
      }
    }

    if (c.facebookPageUrl) {
      if (hasCompetitorSignalForDay(c.name, 'facebook', dateIso)) {
        skipped += 1;
      } else {
        const html = await fetchHtml(c.facebookPageUrl);
        if (html) {
          const { headline, summary } = buildFacebookSignal(
            c.name,
            c.facebookPageUrl,
            html
          );
          insertCompetitorSignal({
            competitorName: c.name,
            source: 'facebook',
            url: c.facebookPageUrl,
            dateIso,
            headline,
            summary
          });
          facebookInserted += 1;
        }
      }
    }
  }

  return {
    ok: true,
    message: `Processed ${allowed.length} competitor(s); website rows +${websiteInserted}, facebook rows +${facebookInserted}, skipped (already today) ${skipped}.`,
    websiteInserted,
    facebookInserted,
    skipped
  };
}

/** @deprecated Stub report — prefer `generate_competitor_report` MCP tool with DB signals. */
export type CompetitorReportStub = {
  stub: true;
  generatedAt: string;
  summary: string;
  sections: {
    whatCompetitorsPush: string;
    postingFrequency: string;
    observedTactics: string;
    positioningForAtoZ: string;
    postIdeasWithoutNaming: string[];
  };
  legalNote: string;
};

export function buildStubCompetitorReport(): CompetitorReportStub {
  return {
    stub: true,
    generatedAt: new Date().toISOString(),
    summary:
      'Stub report: use generate_competitor_report with ingested competitor_signals instead.',
    sections: {
      whatCompetitorsPush:
        'Section 1 (placeholder): Summarise promotional themes from public signals once ingested.',
      postingFrequency:
        'Section 2 (placeholder): Infer rough cadence from public post timestamps when available.',
      observedTactics:
        'Section 3 (placeholder): Discount-heavy vs education vs inspiration mix.',
      positioningForAtoZ:
        'Section 4 (placeholder): Contrast crowded angles with A to Z strengths (quality install, insurance, climate-fit, local trust).',
      postIdeasWithoutNaming: [
        'Placeholder: original angle on long-term value vs headline price.',
        'Placeholder: insurance replacement reassurance without naming others.',
        'Placeholder: QLD humidity + product choice — expert, non-copycat.'
      ]
    },
    legalNote:
      'Use only public, policy-compliant signals; never name competitors in outbound content; inspire original copy only.'
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void runDailyCompetitorScrape().then((r) => {
    console.log(JSON.stringify(r, null, 2));
  });
}
