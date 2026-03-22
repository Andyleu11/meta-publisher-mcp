import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { buildCompetitorReport } from '../competitorReport.js';

const generateReportArgs = z.object({
  lookbackDays: z.coerce.number().int().min(1).max(365).optional().default(14)
});

/**
 * MCP tools for competitive landscape reporting.
 * Feeds the weekly planner with abstract positioning — not for auto-posting.
 */
export function registerCompetitiveInsightsTools(mcpServer: McpServer): void {
  const m = mcpServer as {
    registerTool(
      name: string,
      config: { description: string; inputSchema: z.ZodObject<z.ZodRawShape> },
      handler: (args: unknown) => Promise<CallToolResult>
    ): void;
  };

  m.registerTool(
    'generate_competitor_report',
    {
      description:
        'Return recent competitor signals from the local watcher (public HTML snapshots). ' +
        'Best-effort only: no JS rendering; may be incomplete. ' +
        'Use for inspiration only: do not copy competitor wording; never name competitors in published posts. ' +
        'Align with docs/competitive-insights.md and competitors.json. ' +
        'Optional lookbackDays (default 14).',
      inputSchema: generateReportArgs
    },
    async (args: unknown): Promise<CallToolResult> => {
      const { lookbackDays } = generateReportArgs.parse(args);
      const report = await buildCompetitorReport(lookbackDays);
      return {
        content: [{ type: 'text', text: JSON.stringify(report, null, 2) }]
      };
    }
  );
}
