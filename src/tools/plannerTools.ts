import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { buildPlannerContext } from '../plannerContext.js';

const getPlannerContextArgs = z.object({
  lookbackDays: z.coerce.number().int().min(1).max(90).optional().default(30)
});

/**
 * MCP tools for aggregated planning context (read-only).
 */
export function registerPlannerTools(mcpServer: McpServer): void {
  const m = mcpServer as {
    registerTool(
      name: string,
      config: { description: string; inputSchema: z.ZodObject<z.ZodRawShape> },
      handler: (args: unknown) => Promise<CallToolResult>
    ): void;
  };

  m.registerTool(
    'get_planner_context',
    {
      description:
        'Return a compact JSON snapshot of competitor signals, supplier updates, recent post performance, and a sample of available image `rel` paths from `data/assets-manifest.json` for planning. ' +
        'Use MCP `list_available_assets` for the full manifest. This tool does not create or schedule posts.',
      inputSchema: getPlannerContextArgs
    },
    async (args: unknown): Promise<CallToolResult> => {
      let parsed: z.infer<typeof getPlannerContextArgs>;
      try {
        parsed = getPlannerContextArgs.parse(args);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `get_planner_context: invalid arguments — ${msg}`
            }
          ]
        };
      }

      const context = await buildPlannerContext({ lookbackDays: parsed.lookbackDays });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ok: true, ...context }, null, 2)
          }
        ]
      };
    }
  );
}
