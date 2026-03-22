import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  getLatestPostInsightMetrics,
  insertPostInsight
} from '../db.js';
import {
  getFacebookPostInsights,
  getInstagramMediaInsights,
  MetaGraphError
} from '../metaClient.js';

/** Stored/API keys for both platforms (basic set: impressions, reach, engagement). */
const BASIC_INSIGHT_KEYS = ['impressions', 'reach', 'engagement'] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheComplete(m: Record<string, number>): boolean {
  return BASIC_INSIGHT_KEYS.every(
    (k) => k in m && typeof m[k] === 'number'
  );
}

function formatInsightError(err: unknown): string {
  if (err instanceof MetaGraphError) {
    const code =
      err.graphCode !== undefined ? ` (Graph code ${err.graphCode})` : '';
    return `${err.message}${code}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

async function fetchAndStoreInsights(
  platform: 'facebook' | 'instagram',
  postId: string
): Promise<Record<string, number>> {
  const capturedAt = new Date().toISOString();
  const metrics =
    platform === 'facebook'
      ? await getFacebookPostInsights(postId)
      : await getInstagramMediaInsights(postId);
  for (const [metric, value] of Object.entries(metrics)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      insertPostInsight({
        platform,
        postId,
        metric,
        value,
        capturedAt
      });
    }
  }
  return metrics;
}

const getPostInsightsArgs = z.object({
  platform: z.enum(['facebook', 'instagram']),
  postIds: z
    .array(z.string().min(1))
    .min(1)
    .max(25)
    .describe('Graph post ID (Facebook) or IG media ID (Instagram).'),
  refresh: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'If false, return cached metrics from SQLite when a full snapshot exists; otherwise call the Graph API.'
    )
});

export function registerInsightsTools(mcpServer: McpServer): void {
  const m = mcpServer as {
    registerTool(
      name: string,
      config: { description: string; inputSchema: z.ZodObject<z.ZodRawShape> },
      handler: (args: unknown) => Promise<CallToolResult>
    ): void;
  };

  m.registerTool(
    'get_post_insights',
    {
      description:
        'Fetch and cache basic insights (reach, impressions, engagement) for one or more Facebook Page posts or Instagram media IDs. ' +
        'Uses SQLite `post_insights` when `refresh` is false and a full snapshot exists; otherwise calls the Graph API and stores rows.',
      inputSchema: getPostInsightsArgs
    },
    async (args: unknown): Promise<CallToolResult> => {
      let parsed: z.infer<typeof getPostInsightsArgs>;
      try {
        parsed = getPostInsightsArgs.parse(args);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `get_post_insights: invalid arguments — ${msg}`
            }
          ]
        };
      }

      const { platform, postIds, refresh } = parsed;
      const results: Array<
        | { postId: string; metrics: Record<string, number> }
        | { postId: string; error: string }
      > = [];

      const delayMs = Number(process.env.INSIGHTS_INTER_POST_DELAY_MS ?? 350);

      for (let i = 0; i < postIds.length; i++) {
        const postId = postIds[i];
        if (i > 0 && delayMs > 0) {
          await sleep(delayMs);
        }
        try {
          if (!refresh) {
            const cached = getLatestPostInsightMetrics(postId, platform);
            if (cacheComplete(cached)) {
              results.push({ postId, metrics: { ...cached } });
              continue;
            }
          }
          const metrics = await fetchAndStoreInsights(platform, postId);
          results.push({ postId, metrics });
        } catch (e) {
          results.push({
            postId,
            error: formatInsightError(e)
          });
        }
      }

      const payload = { platform, results };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }]
      };
    }
  );
}
