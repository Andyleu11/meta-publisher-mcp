import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { insertScheduledPost } from '../db.js';

/**
 * Contract for weekly content planning (see `docs/weekly-content-planning-prompt.md`).
 * Intended for 7-day plans, `facebook` / `instagram` / `both`, and Australia/Brisbane evening slots.
 * Rows are stored in SQLite (`data/meta-publisher.db`); the in-process scheduler in `src/index.ts`
 * publishes when `run_at` (UTC) is due.
 */
const schedulePostArgs = z.object({
  platform: z.enum(['facebook', 'instagram', 'both']).describe(
    'Target surface: Facebook Page only, Instagram Business feed only, or both (same asset + caption for each when implemented).'
  ),
  runAtIso: z.string().describe(
    'When to run the post, as ISO-8601 with offset for Australia/Brisbane, e.g. 2025-03-22T18:30:00+10:00. Must match the planner’s 6:30pm–8:30pm local window.'
  ),
  caption: z.string().describe('Final caption (Facebook may be slightly longer than IG when implemented).'),
  imageUrl: z.string().describe('Public HTTPS URL of the image asset.')
});

export type SchedulePostInput = z.infer<typeof schedulePostArgs>;

function normalizeRunAt(runAtIso: string): string | null {
  const ms = Date.parse(runAtIso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

export function registerSchedulingTools(mcpServer: McpServer): void {
  const m = mcpServer as {
    registerTool(
      name: string,
      config: { description: string; inputSchema: z.ZodObject<z.ZodRawShape> },
      handler: (args: unknown) => Promise<CallToolResult>
    ): void;
  };

  m.registerTool(
    'schedule_post',
    {
      description:
        'Queue a post for the A to Z weekly planner: persists to SQLite and the in-process scheduler ' +
        '(see README) publishes at runAtIso (stored as UTC). Use post_facebook_photo / post_instagram_photo for immediate publish.',
      inputSchema: schedulePostArgs
    },
    async (args: unknown): Promise<CallToolResult> => {
      const parsed = schedulePostArgs.parse(args);
      const runAtUtc = normalizeRunAt(parsed.runAtIso);
      if (!runAtUtc) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text:
                'schedule_post: invalid runAtIso — must be a parseable ISO-8601 datetime (e.g. 2025-03-22T18:30:00+10:00).'
            }
          ]
        };
      }

      const id = insertScheduledPost({
        platform: parsed.platform,
        runAtIsoUtc: runAtUtc,
        caption: parsed.caption,
        imageUrl: parsed.imageUrl
      });

      const payload = {
        ok: true as const,
        id,
        scheduled: true as const,
        runAtIsoUtc: runAtUtc,
        platform: parsed.platform,
        message:
          'Saved to SQLite. The MCP scheduler will publish when due (disable with SCHEDULER_ENABLED=false).'
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }]
      };
    }
  );
}
