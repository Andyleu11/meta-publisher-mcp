import { metaConfig } from './config.js';
import { request } from 'undici';

const GRAPH_HOST = 'https://graph.facebook.com';

/** https://developers.facebook.com/docs/graph-api/guides/error-handling/ */
type GraphErrorBody = {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

export class MetaGraphError extends Error {
  override readonly name = 'MetaGraphError';

  constructor(
    message: string,
    readonly httpStatus: number,
    readonly graphCode?: number,
    readonly graphSubcode?: number,
    readonly rawBody?: string
  ) {
    super(message);
  }
}

function parseJson(text: string, httpStatus: number): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MetaGraphError(
      `Graph API returned non-JSON (HTTP ${httpStatus}): ${text.slice(0, 300)}`,
      httpStatus,
      undefined,
      undefined,
      text
    );
  }
}

/**
 * POST to the Graph API with access_token. Single place for URL + auth.
 * @see https://developers.facebook.com/docs/graph-api/guides/error-handling/
 */
export async function graphPost<T extends Record<string, unknown>>(
  path: string,
  params: Record<string, string>
): Promise<T> {
  const url = `${GRAPH_HOST}/${metaConfig.graphApiVersion}/${path}`;
  const form = new URLSearchParams({
    ...params,
    access_token: metaConfig.accessToken
  });

  const res = await request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });
  const text = await res.body.text();
  const data = parseJson(text, res.statusCode) as Record<string, unknown>;

  if (data.error && typeof data.error === 'object' && data.error !== null) {
    const graphErr = data.error as GraphErrorBody;
    const msg =
      typeof graphErr.message === 'string'
        ? graphErr.message
        : JSON.stringify(data.error);
    throw new MetaGraphError(
      msg,
      res.statusCode,
      graphErr.code,
      graphErr.error_subcode,
      text
    );
  }

  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new MetaGraphError(
      `Graph API HTTP ${res.statusCode}: ${text.slice(0, 500)}`,
      res.statusCode,
      undefined,
      undefined,
      text
    );
  }

  return data as T;
}

const DEFAULT_GRAPH_TIMEOUT_MS = 45_000;

async function fetchGraphJson<T extends Record<string, unknown>>(
  url: string,
  timeoutMs: number
): Promise<T> {
  const res = await request(url, {
    method: 'GET',
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await res.body.text();
  const data = parseJson(text, res.statusCode) as Record<string, unknown>;

  if (data.error && typeof data.error === 'object' && data.error !== null) {
    const graphErr = data.error as GraphErrorBody;
    const msg =
      typeof graphErr.message === 'string'
        ? graphErr.message
        : JSON.stringify(data.error);
    throw new MetaGraphError(
      msg,
      res.statusCode,
      graphErr.code,
      graphErr.error_subcode,
      text
    );
  }

  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new MetaGraphError(
      `Graph API HTTP ${res.statusCode}: ${text.slice(0, 500)}`,
      res.statusCode,
      undefined,
      undefined,
      text
    );
  }

  return data as T;
}

async function graphGetFetch<T extends Record<string, unknown>>(
  path: string,
  query: Record<string, string> | undefined,
  timeoutMs: number
): Promise<T> {
  const base = `${GRAPH_HOST}/${metaConfig.graphApiVersion}/${path}`;
  const u = new URL(base);
  u.searchParams.set('access_token', metaConfig.accessToken);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      u.searchParams.set(k, v);
    }
  }
  return fetchGraphJson<T>(u.toString(), timeoutMs);
}

function isRetryableRateLimit(err: unknown): boolean {
  if (!(err instanceof MetaGraphError)) return false;
  if (err.httpStatus === 429) return true;
  const c = err.graphCode;
  return c === 4 || c === 17 || c === 32 || c === 613 || c === 8004;
}

async function graphGetWithRetry<T extends Record<string, unknown>>(
  path: string,
  query: Record<string, string> | undefined,
  options?: { timeoutMs?: number; maxAttempts?: number }
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_GRAPH_TIMEOUT_MS;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await graphGetFetch<T>(path, query, timeoutMs);
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts && isRetryableRateLimit(e)) {
        await sleep(400 * Math.pow(2, attempt - 1));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

/**
 * GET from the Graph API with access_token (query param).
 * @see https://developers.facebook.com/docs/graph-api/guides/error-handling/
 */
async function graphGet<T extends Record<string, unknown>>(
  path: string,
  options?: { timeoutMs?: number }
): Promise<T> {
  return graphGetFetch<T>(
    path,
    undefined,
    options?.timeoutMs ?? DEFAULT_GRAPH_TIMEOUT_MS
  );
}

/**
 * Page post insights — Graph metric names (mapped to impressions / reach / engagement).
 * `post_impressions_unique` ≈ unique people reached (see Graph insights docs).
 */
export const DEFAULT_FACEBOOK_INSIGHT_METRICS = [
  'post_impressions',
  'post_impressions_unique',
  'post_engaged_users'
] as const;

/** Instagram media insights — Graph metric names. */
export const DEFAULT_INSTAGRAM_INSIGHT_METRICS = [
  'impressions',
  'reach',
  'engagement'
] as const;

const FB_GRAPH_TO_KEY: Record<string, string> = {
  post_impressions: 'impressions',
  post_impressions_unique: 'reach',
  post_engaged_users: 'engagement'
};

const IG_GRAPH_TO_KEY: Record<string, string> = {
  impressions: 'impressions',
  reach: 'reach',
  engagement: 'engagement'
};

type InsightDataItem = {
  name: string;
  values?: Array<{ value?: number | Record<string, unknown> }>;
  total_value?: number;
};

type InsightsResponse = { data?: InsightDataItem[] };

function parseInsightValue(item: InsightDataItem): number {
  if (typeof item.total_value === 'number') return item.total_value;
  const v0 = item.values?.[0];
  if (!v0) return 0;
  const val = v0.value;
  if (typeof val === 'number') return val;
  if (
    typeof val === 'object' &&
    val !== null &&
    'value' in val &&
    typeof (val as { value: unknown }).value === 'number'
  ) {
    return (val as { value: number }).value;
  }
  return 0;
}

function mapInsightsData(
  data: InsightsResponse,
  graphToKey: Record<string, string>
): Record<string, number> {
  const out: Record<string, number> = {};
  const items = data.data ?? [];
  for (const item of items) {
    const key = graphToKey[item.name] ?? item.name;
    out[key] = parseInsightValue(item);
  }
  return out;
}

/**
 * Facebook Page post insights (lifetime metrics).
 * @see https://developers.facebook.com/docs/graph-api/reference/insights/
 */
export async function getFacebookPostInsights(
  postId: string,
  metrics: string[] = [...DEFAULT_FACEBOOK_INSIGHT_METRICS]
): Promise<Record<string, number>> {
  const m =
    metrics.length > 0 ? metrics : [...DEFAULT_FACEBOOK_INSIGHT_METRICS];
  const data = await graphGetWithRetry<InsightsResponse>(
    `${encodeURIComponent(postId)}/insights`,
    { metric: m.join(',') }
  );
  return mapInsightsData(data, FB_GRAPH_TO_KEY);
}

/**
 * Instagram media object insights.
 * @see https://developers.facebook.com/docs/instagram-api/reference/ig-media/insights
 */
export async function getInstagramMediaInsights(
  mediaId: string,
  metrics: string[] = [...DEFAULT_INSTAGRAM_INSIGHT_METRICS]
): Promise<Record<string, number>> {
  const m =
    metrics.length > 0 ? metrics : [...DEFAULT_INSTAGRAM_INSIGHT_METRICS];
  const data = await graphGetWithRetry<InsightsResponse>(
    `${encodeURIComponent(mediaId)}/insights`,
    { metric: m.join(',') }
  );
  return mapInsightsData(data, IG_GRAPH_TO_KEY);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wrapInstagramStep(stepLabel: string, err: unknown): never {
  if (err instanceof MetaGraphError) {
    throw new MetaGraphError(
      `${stepLabel}: ${err.message}`,
      err.httpStatus,
      err.graphCode,
      err.graphSubcode,
      err.rawBody
    );
  }
  throw err;
}

function adAccountActPath(): string {
  const raw = metaConfig.adAccountId.trim();
  return raw.toLowerCase().startsWith('act_') ? raw : `act_${raw}`;
}

/**
 * Page photo by URL.
 * @see https://developers.facebook.com/docs/graph-api/reference/page/photos/
 */
export async function postFacebookPhoto(
  message: string,
  imageUrl: string,
  options?: { published?: boolean }
): Promise<{ id: string }> {
  const params: Record<string, string> = {
    caption: message,
    url: imageUrl
  };
  if (options?.published !== undefined) {
    params.published = options.published ? 'true' : 'false';
  }
  return graphPost<{ id: string }>(`${metaConfig.pageId}/photos`, params);
}

type IgMediaContainer = {
  id: string;
  /** e.g. ERROR, FINISHED, IN_PROGRESS — @see Instagram Content Publishing */
  status_code?: string;
  status?: string;
};

const IG_POLL_ATTEMPTS = 15;
const IG_POLL_MS = 2000;

/**
 * Instagram feed image: two-step Content Publishing API — `POST .../media` (container),
 * then `POST .../media_publish`. If the container is `IN_PROGRESS`, polls `GET .../{id}`
 * until `FINISHED`, `ERROR`, or timeout.
 * @see https://developers.facebook.com/docs/instagram-api/content-publishing/
 */
export async function postInstagramPhoto(
  caption: string,
  imageUrl: string
): Promise<{ creationId: string; mediaId: string }> {
  let creation: IgMediaContainer;
  try {
    creation = await graphPost<IgMediaContainer>(`${metaConfig.igUserId}/media`, {
      image_url: imageUrl,
      caption
    });
  } catch (e) {
    wrapInstagramStep('Instagram step 1 (create media container)', e);
  }

  if (!creation.id) {
    throw new MetaGraphError(
      'Instagram step 1 (create media container): response missing id',
      200,
      undefined,
      undefined,
      JSON.stringify(creation)
    );
  }

  let state = creation.status_code ?? creation.status;
  let attempts = 0;
  while (state === 'IN_PROGRESS' && attempts < IG_POLL_ATTEMPTS) {
    await sleep(IG_POLL_MS);
    try {
      const polled = await graphGet<IgMediaContainer>(
        `${creation.id}?fields=status_code,status`
      );
      state = polled.status_code ?? polled.status;
    } catch (e) {
      wrapInstagramStep('Instagram (poll media container status)', e);
    }
    attempts += 1;
  }

  if (state === 'IN_PROGRESS') {
    throw new MetaGraphError(
      `Instagram media container still IN_PROGRESS after ${IG_POLL_ATTEMPTS} polls (${IG_POLL_MS}ms apart). Retry publish later.`,
      200,
      undefined,
      undefined,
      JSON.stringify({ creationId: creation.id, lastStatus: state })
    );
  }

  if (state === 'ERROR') {
    throw new MetaGraphError(
      'Instagram media container finished with ERROR (image URL, permissions, or format). Check image is public HTTPS and meets Instagram requirements.',
      200,
      undefined,
      undefined,
      JSON.stringify(creation)
    );
  }

  let published: { id: string };
  try {
    published = await graphPost<{ id: string }>(
      `${metaConfig.igUserId}/media_publish`,
      {
        creation_id: creation.id
      }
    );
  } catch (e) {
    wrapInstagramStep('Instagram step 2 (media_publish)', e);
  }

  if (!published.id) {
    throw new MetaGraphError(
      'Instagram step 2 (media_publish): response missing media id',
      200,
      undefined,
      undefined,
      JSON.stringify(published)
    );
  }

  return { creationId: creation.id, mediaId: published.id };
}

export async function createCampaign(name: string, objective = 'REACH') {
  return graphPost<{ id: string }>(`${adAccountActPath()}/campaigns`, {
    name,
    objective,
    status: 'PAUSED',
    special_ad_categories: '[]'
  });
}

export async function createAdSetLocal(params: {
  campaignId: string;
  name: string;
  dailyBudgetAud: number;
  radiusKm: number;
  ageMin: number;
  ageMax: number;
}): Promise<{ id: string }> {
  const { campaignId, name, dailyBudgetAud, radiusKm, ageMin, ageMax } = params;

  const dailyBudgetCents = Math.round(dailyBudgetAud * 100);

  // Approximate centres for your core areas
  const locations = [
    // Brisbane CBD
    { latitude: -27.4698, longitude: 153.0251 },
    // Redlands / Capalaba
    { latitude: -27.5236, longitude: 153.190 },
    // Logan Central
    { latitude: -27.6392, longitude: 153.1094 }
  ];

  const targeting = {
    age_min: ageMin,
    age_max: ageMax,
    geo_locations: {
      custom_locations: locations.map((loc) => ({
        latitude: loc.latitude,
        longitude: loc.longitude,
        radius: radiusKm,
        distance_unit: 'kilometer'
      })),
      // People who live in or were recently in these areas
      location_types: ['home', 'recent']
    }
    // TODO: later add interests (home improvement, homeowners, etc.)
  };

  return graphPost<{ id: string }>(`${adAccountActPath()}/adsets`, {
    name,
    campaign_id: campaignId,
    daily_budget: String(dailyBudgetCents),
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'REACH',
    status: 'PAUSED',
    targeting: JSON.stringify(targeting)
  });
}

export async function createAdFromCreative(params: {
  adSetId: string;
  creativeId: string;
  name: string;
}) {
  // TODO: Implement Marketing API ad creation using existing creative.
  return params as unknown;
}
