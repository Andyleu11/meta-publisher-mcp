import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  assetMatchesCategory,
  getAvailableAssets,
  getManifestScanRoot,
  type ManifestAsset
} from '../assetLoader.js';

const listAvailableAssetsArgs = z.object({
  filter: z.enum(['all', 'brand-tiles', 'photos']).optional().default('all')
});

function filterAssets(
  assets: ManifestAsset[],
  filter: 'all' | 'brand-tiles' | 'photos'
): ManifestAsset[] {
  if (filter === 'all') return assets.map((a) => ({ ...a }));
  return assets.filter((a) => assetMatchesCategory(a.rel, filter));
}

/**
 * MCP tools for the on-disk asset manifest (`data/assets-manifest.json`).
 */
export function registerAssetTools(mcpServer: McpServer): void {
  const m = mcpServer as {
    registerTool(
      name: string,
      config: { description: string; inputSchema: z.ZodObject<z.ZodRawShape> },
      handler: (args: unknown) => Promise<CallToolResult>
    ): void;
  };

  m.registerTool(
    'list_available_assets',
    {
      description:
        'Return brand tiles and images from `data/assets-manifest.json` (relative paths + hashes). ' +
        'Use these `rel` values (or their basename) in `create_draft_post` `imageUrl` when posting local assets. ' +
        'Refresh the manifest by running `node scripts/hash-image-assets.mjs "<folder>"` from the project root.',
      inputSchema: listAvailableAssetsArgs
    },
    async (args: unknown): Promise<CallToolResult> => {
      try {
        const p = listAvailableAssetsArgs.parse(args);
        const all = getAvailableAssets();
        const items = filterAssets(all, p.filter);
        const payload = {
          manifestScanRoot: getManifestScanRoot(),
          filter: p.filter,
          count: items.length,
          items
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }]
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          isError: true,
          content: [{ type: 'text', text: `list_available_assets: ${msg}` }]
        };
      }
    }
  );
}
