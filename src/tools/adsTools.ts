import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createCampaign, createAdSetLocal, createAdFromCreative } from '../metaClient.js';
import { metaConfig } from '../config.js';

const localAwarenessArgs = z.object({
  creativeId: z.string(),
  radiusKm: z.number().optional(),
  ageMin: z.number().optional(),
  ageMax: z.number().optional(),
  dailyBudgetAud: z.number().optional()
});

export function registerAdsTools(mcpServer: McpServer): void {
  const m = mcpServer as {
    registerTool(
      name: string,
      config: { description: string; inputSchema: z.ZodObject<z.ZodRawShape> },
      handler: (args: unknown) => Promise<CallToolResult>
    ): void;
  };

  m.registerTool(
    'create_local_awareness_ad',
    {
      description: 'Create a 7-day local awareness ad around Bundaberg using an existing creative.',
      inputSchema: localAwarenessArgs
    },
    async (args: unknown): Promise<CallToolResult> => {
      const { creativeId, radiusKm, ageMin, ageMax, dailyBudgetAud } =
        localAwarenessArgs.parse(args);

      const campaign = await createCampaign('A2Z Local Awareness – Bundaberg');

      const adSet = await createAdSetLocal({
        campaignId: campaign.id,
        name: 'A2Z Bundaberg Radius',
        dailyBudgetAud: dailyBudgetAud ?? metaConfig.defaultDailyBudgetAud,
        radiusKm: radiusKm ?? metaConfig.defaultAdRadiusKm,
        ageMin: ageMin ?? metaConfig.defaultAgeMin,
        ageMax: ageMax ?? metaConfig.defaultAgeMax
      });

      const adSetRecord = adSet as Record<string, unknown>;
      const adSetId =
        typeof adSetRecord.id === 'string' ? adSetRecord.id : 'pending-ad-set-id';

      const ad = await createAdFromCreative({
        adSetId,
        creativeId,
        name: 'A2Z Local Awareness – Bundaberg'
      });

      return {
        content: [{ type: 'text', text: JSON.stringify({ campaign, adSet, ad }) }]
      };
    }
  );
}
