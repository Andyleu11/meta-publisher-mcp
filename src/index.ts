import './config.js';
import './brandRules.js';
import { loadAssetManifest } from './assetLoader.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initSchema } from './db.js';
import { startCompetitorScrapeScheduler, startSchedulerLoop } from './scheduler.js';
import { registerOrganicTools } from './tools/organicTools.js';
import { registerAdsTools } from './tools/adsTools.js';
import { registerSchedulingTools } from './tools/schedulingTools.js';
import { registerCompetitiveInsightsTools } from './tools/competitiveInsightsTools.js';
import { registerSupplierEmailTools } from './tools/supplierEmailTools.js';
import { registerSupplierInsightsTools } from './tools/supplierInsightsTools.js';
import { registerInsightsTools } from './tools/insightsTools.js';
import { registerPlannerTools } from './tools/plannerTools.js';
import { registerDraftTools } from './tools/draftTools.js';
import { registerAssetTools } from './tools/assetTools.js';

initSchema();
loadAssetManifest();

const mcpServer = new McpServer(
  { name: 'meta-publisher-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

registerOrganicTools(mcpServer);
registerAdsTools(mcpServer);
registerSchedulingTools(mcpServer);
registerCompetitiveInsightsTools(mcpServer);
registerSupplierEmailTools(mcpServer);
registerSupplierInsightsTools(mcpServer);
registerInsightsTools(mcpServer);
registerPlannerTools(mcpServer);
registerAssetTools(mcpServer);
registerDraftTools(mcpServer);

startSchedulerLoop();
startCompetitorScrapeScheduler();

const transport = new StdioServerTransport();
await mcpServer.connect(transport);
