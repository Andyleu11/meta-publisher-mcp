import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  type DraftPostRow,
  getDraftPostById,
  insertDraftPost,
  listDraftPosts,
  updateDraftPostStatus
} from '../db.js';
import { promoteDraftToScheduled } from '../draftsService.js';
import { checkDraftCaption } from '../brandRulesCheck.js';

function draftRowToDto(row: DraftPostRow): Record<string, unknown> {
  let platforms: string[] = [];
  try {
    platforms = JSON.parse(row.platforms) as string[];
  } catch {
    platforms = [];
  }
  let source: unknown = null;
  if (row.source_json) {
    try {
      source = JSON.parse(row.source_json) as unknown;
    } catch {
      source = row.source_json;
    }
  }
  return {
    id: row.id,
    caption: row.caption,
    imageUrl: row.image_url,
    platforms,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    scheduledPostId: row.scheduled_post_id,
    source
  };
}

const platformEnum = z.enum(['facebook', 'instagram']);

const createDraftPostArgs = z.object({
  caption: z.string().min(1),
  imageUrl: z.string().optional(),
  platforms: z.array(platformEnum).min(1),
  createdBy: z.string().optional().default('ai'),
  source: z.unknown().optional()
});

const listDraftPostsArgs = z.object({
  statuses: z.array(z.string()).optional().default(['draft'])
});

const updateDraftPostStatusArgs = z.object({
  id: z.number().int().positive(),
  status: z.enum(['approved', 'rejected']),
  rejectionReason: z.string().optional()
});

const scheduleDraftPostArgs = z.object({
  draftId: z.number().int().positive(),
  runAtIso: z
    .string()
    .describe(
      'When to publish, ISO-8601 (e.g. Australia/Brisbane offset). Stored as UTC in scheduled_posts.'
    )
});

export function registerDraftTools(mcpServer: McpServer): void {
  const m = mcpServer as {
    registerTool(
      name: string,
      config: { description: string; inputSchema: z.ZodObject<z.ZodRawShape> },
      handler: (args: unknown) => Promise<CallToolResult>
    ): void;
  };

  m.registerTool(
    'create_draft_post',
    {
      description:
        'Save a proposed post as status `draft` in SQLite (`draft_posts`). Does not schedule or publish. ' +
        'Response includes `brandWarnings` (competitor names, long verbatim chunks vs `source`, near-duplicate caption vs recent drafts, repeated `imageUrl` vs last 10 drafts, `asset_not_found` if `imageUrl` is not in `data/assets-manifest.json` — see `brandRulesCheck.ts` + `list_available_assets`). ' +
        'Use `update_draft_post_status` to approve/reject, then `schedule_draft_post` to queue for the in-process scheduler.',
      inputSchema: createDraftPostArgs
    },
    async (args: unknown): Promise<CallToolResult> => {
      try {
        const p = createDraftPostArgs.parse(args);
        const sourceJson =
          p.source !== undefined
            ? JSON.stringify(p.source)
            : null;
        const id = insertDraftPost({
          caption: p.caption,
          imageUrl: p.imageUrl ?? null,
          platforms: p.platforms,
          createdBy: p.createdBy ?? 'ai',
          sourceJson
        });
        const row = getDraftPostById(id);
        if (!row) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'create_draft_post: insert failed' }]
          };
        }
        const dto = draftRowToDto(row);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ...dto,
                brandWarnings: checkDraftCaption(row.caption, row.source_json, {
                  excludeDraftId: row.id,
                  imageUrl: row.image_url
                })
              })
            }
          ]
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          isError: true,
          content: [{ type: 'text', text: `create_draft_post: ${msg}` }]
        };
      }
    }
  );

  m.registerTool(
    'list_draft_posts',
    {
      description:
        'List rows from `draft_posts` filtered by status (default: draft only). Each item includes `brandWarnings` (same heuristics as `create_draft_post`). Does not publish.',
      inputSchema: listDraftPostsArgs
    },
    async (args: unknown): Promise<CallToolResult> => {
      try {
        const p = listDraftPostsArgs.parse(args);
        const statuses =
          p.statuses && p.statuses.length > 0 ? p.statuses : undefined;
        const rows = listDraftPosts(statuses);
        const items = rows.map((r) => ({
          ...draftRowToDto(r),
          brandWarnings: checkDraftCaption(r.caption, r.source_json, {
            excludeDraftId: r.id,
            imageUrl: r.image_url
          })
        }));
        return {
          content: [{ type: 'text', text: JSON.stringify({ items }) }]
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          isError: true,
          content: [{ type: 'text', text: `list_draft_posts: ${msg}` }]
        };
      }
    }
  );

  m.registerTool(
    'update_draft_post_status',
    {
      description:
        'Set a draft to `approved` or `rejected` (only from status `draft`). Does not post to Meta. ' +
        'Optional `rejectionReason` is merged into `source_json` when rejecting.',
      inputSchema: updateDraftPostStatusArgs
    },
    async (args: unknown): Promise<CallToolResult> => {
      try {
        const p = updateDraftPostStatusArgs.parse(args);
        const ok = updateDraftPostStatus(p.id, p.status, {
          rejectionReason: p.rejectionReason
        });
        if (!ok) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text:
                  'update_draft_post_status: draft not found or not in `draft` status'
              }
            ]
          };
        }
        const row = getDraftPostById(p.id);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(row ? draftRowToDto(row) : { id: p.id })
            }
          ]
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          isError: true,
          content: [{ type: 'text', text: `update_draft_post_status: ${msg}` }]
        };
      }
    }
  );

  m.registerTool(
    'schedule_draft_post',
    {
      description:
        'Queue an **approved** draft into `scheduled_posts` at `runAtIso` (UTC-normalized). ' +
        'Marks the draft `scheduled` and links `scheduled_post_id`. Does not call Meta immediately — the in-process scheduler publishes when due.',
      inputSchema: scheduleDraftPostArgs
    },
    async (args: unknown): Promise<CallToolResult> => {
      try {
        const p = scheduleDraftPostArgs.parse(args);
        const result = await promoteDraftToScheduled(p.draftId, p.runAtIso);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                scheduledId: result.scheduledId
              })
            }
          ]
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          isError: true,
          content: [{ type: 'text', text: `schedule_draft_post: ${msg}` }]
        };
      }
    }
  );
}
