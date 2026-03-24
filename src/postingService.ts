import { getMeta } from './db.js';
import { postFacebookPhoto, postInstagramPhoto } from './metaClient.js';

export type PostingPlatform = 'facebook' | 'instagram' | 'linkedin' | 'google_business';

export interface PostResult {
  ok: boolean;
  postId?: string;
  error?: string;
}

async function postLinkedIn(caption: string, _imageUrl: string): Promise<PostResult> {
  const accessToken = getMeta('linkedin_access_token');
  const orgId = getMeta('linkedin_org_id');

  if (!accessToken || !orgId) {
    return { ok: false, error: 'LinkedIn credentials not configured (linkedin_access_token, linkedin_org_id in Settings)' };
  }

  const body = {
    author: `urn:li:organization:${orgId}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: caption },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `LinkedIn API ${response.status}: ${text.slice(0, 300)}` };
  }

  const json = (await response.json()) as Record<string, unknown>;
  return { ok: true, postId: typeof json.id === 'string' ? json.id : undefined };
}

async function postGoogleBusiness(caption: string, _imageUrl: string): Promise<PostResult> {
  const accessToken = getMeta('gbp_access_token');
  const locationId = getMeta('gbp_location_id');

  if (!accessToken || !locationId) {
    return {
      ok: false,
      error: 'Google Business Profile credentials not configured (gbp_access_token, gbp_location_id in Settings)',
    };
  }

  const body = {
    languageCode: 'en',
    topicType: 'STANDARD',
    summary: caption,
  };

  const url = `https://mybusiness.googleapis.com/v4/${locationId}/localPosts`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `GBP API ${response.status}: ${text.slice(0, 300)}` };
  }

  const json = (await response.json()) as Record<string, unknown>;
  return { ok: true, postId: typeof json.name === 'string' ? json.name : undefined };
}

export async function publishToplatform(
  platform: PostingPlatform,
  caption: string,
  imageUrl: string,
): Promise<PostResult> {
  switch (platform) {
    case 'facebook':
      try {
        await postFacebookPhoto(caption, imageUrl);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: `Facebook: ${e instanceof Error ? e.message : String(e)}` };
      }
    case 'instagram':
      try {
        await postInstagramPhoto(caption, imageUrl);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: `Instagram: ${e instanceof Error ? e.message : String(e)}` };
      }
    case 'linkedin':
      return postLinkedIn(caption, imageUrl);
    case 'google_business':
      return postGoogleBusiness(caption, imageUrl);
    default:
      return { ok: false, error: `Unknown platform: ${platform}` };
  }
}
