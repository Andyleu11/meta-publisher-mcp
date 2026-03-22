import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MetaGraphError, postFacebookPhoto, postInstagramPhoto } from '../metaClient.js';

const facebookPhotoArgs = z.object({
  message: z.string(),
  imageUrl: z.string(),
  published: z.boolean().optional()
});

const instagramPhotoArgs = z.object({
  caption: z.string(),
  imageUrl: z.string().describe('Public HTTPS URL; use 4:5 or square assets per docs/weekly-content-planning-prompt.md.')
});

export function registerOrganicTools(mcpServer: McpServer): void {
  // Cast: MCP SDK + Zod registerTool generics can stall tsc; runtime validation unchanged.
  const m = mcpServer as {
    registerTool(
      name: string,
      config: { description: string; inputSchema: z.ZodObject<z.ZodRawShape> },
      handler: (args: unknown) => Promise<CallToolResult>
    ): void;
  };

  m.registerTool(
    'post_facebook_photo',
    {
      description:
        'Publish a photo with caption to the A to Z Facebook Page. imageUrl must be a public HTTPS URL (Graph Page /photos).',
      inputSchema: facebookPhotoArgs
    },
    async (args: unknown): Promise<CallToolResult> => {
      const { message, imageUrl, published } = facebookPhotoArgs.parse(args);
      try {
        const result = await postFacebookPhoto(message, imageUrl, { published });
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (e) {
        if (e instanceof MetaGraphError) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `post_facebook_photo failed: ${e.message}`
              }
            ]
          };
        }
        throw e;
      }
    }
  );

  m.registerTool(
    'post_instagram_photo',
    {
      description:
        'Publish a feed photo to the linked Instagram Business account (Content Publishing: create container, then media_publish). imageUrl must be public HTTPS.',
      inputSchema: instagramPhotoArgs
    },
    async (args: unknown): Promise<CallToolResult> => {
      const { caption, imageUrl } = instagramPhotoArgs.parse(args);
      try {
        const result = await postInstagramPhoto(caption, imageUrl);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (e) {
        if (e instanceof MetaGraphError) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `post_instagram_photo failed: ${e.message}`
              }
            ]
          };
        }
        throw e;
      }
    }
  );
}
