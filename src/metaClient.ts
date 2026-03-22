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

/**
 * Instagram image: create container, then publish.
 * @see https://developers.facebook.com/docs/instagram-api/content-publishing/
 */
export async function postInstagramPhoto(
  caption: string,
  imageUrl: string
): Promise<{ creationId: string; mediaId: string }> {
  const creation = await graphPost<IgMediaContainer>(`${metaConfig.igUserId}/media`, {
    image_url: imageUrl,
    caption
  });

  const state = creation.status_code ?? creation.status;
  if (state === 'ERROR') {
    throw new MetaGraphError(
      'Instagram media container returned ERROR status',
      200,
      undefined,
      undefined,
      JSON.stringify(creation)
    );
  }

  const published = await graphPost<{ id: string }>(`${metaConfig.igUserId}/media_publish`, {
    creation_id: creation.id
  });

  return { creationId: creation.id, mediaId: published.id };
}

export async function createCampaign(name: string, objective = 'REACH') {
  return graphPost<{ id: string }>(`act_${metaConfig.adAccountId}/campaigns`, {
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
}) {
  // TODO: Implement Marketing API ad set creation with geo + age targeting.
  return params as unknown;
}

export async function createAdFromCreative(params: {
  adSetId: string;
  creativeId: string;
  name: string;
}) {
  // TODO: Implement Marketing API ad creation using existing creative.
  return params as unknown;
}
