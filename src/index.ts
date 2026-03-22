import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerOrganicTools } from './tools/organicTools.js';
import { registerAdsTools } from './tools/adsTools.js';

const mcpServer = new McpServer(
  { name: 'meta-publisher-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

registerOrganicTools(mcpServer);
registerAdsTools(mcpServer);

const transport = new StdioServerTransport();
await mcpServer.connect(transport);
