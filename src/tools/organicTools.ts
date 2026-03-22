import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { postFacebookPhoto, postInstagramPhoto } from '../metaClient.js';

const facebookPhotoArgs = z.object({
  message: z.string(),
  imageUrl: z.string(),
  published: z.boolean().optional()
});

const instagramPhotoArgs = z.object({
  caption: z.string(),
  imageUrl: z.string()
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
      const result = await postFacebookPhoto(message, imageUrl, { published });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    }
  );

  m.registerTool(
    'post_instagram_photo',
    {
      description:
        'Publish a photo with caption to the linked Instagram Business account. imageUrl must be a public HTTPS URL (Instagram Content Publishing).',
      inputSchema: instagramPhotoArgs
    },
    async (args: unknown): Promise<CallToolResult> => {
      const { caption, imageUrl } = instagramPhotoArgs.parse(args);
      const result = await postInstagramPhoto(caption, imageUrl);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    }
  );
}
