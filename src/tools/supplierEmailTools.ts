import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ingestSupplierEmailCore } from '../supplierEmailIngest.js';
import type { SupplierUpdate } from '../supplierTypes.js';

const ingestEmailArgs = z.object({
  fromEmail: z.string().describe('Sender email address (supplier or manufacturer contact).'),
  subject: z.string(),
  bodyText: z.string(),
  attachmentNames: z.array(z.string()).optional().describe('Filenames of attachments the user has already uploaded elsewhere.'),
  manualTags: z.array(z.string()).optional().describe('Optional tags merged into supplier_updates (e.g. promo, hybrid bulletin).')
});

export function registerSupplierEmailTools(mcpServer: McpServer): void {
  const m = mcpServer as {
    registerTool(
      name: string,
      config: { description: string; inputSchema: z.ZodObject<z.ZodRawShape> },
      handler: (args: unknown) => Promise<CallToolResult>
    ): void;
  };

  m.registerTool(
    'ingest_supplier_email',
    {
      description:
        'Ingest a supplier/manufacturer email (and optional attachment filenames). Maps `fromEmail` to a supplier via `emailDomains` in suppliers.json; ' +
        'stores a `supplier_updates` row with source `email` when matched and `allowEmailContent` is true. ' +
        'Adds light keyword tags (promo / new product / technical) — not full NLP. OCR on PDFs/images is a future step. ' +
        'Never posts to social media; planner must rephrase in A to Z voice and obtain approval before scheduling.',
      inputSchema: ingestEmailArgs
    },
    async (args: unknown): Promise<CallToolResult> => {
      const parsed = ingestEmailArgs.parse(args);
      const result = await ingestSupplierEmailCore({
        fromEmail: parsed.fromEmail,
        subject: parsed.subject,
        bodyText: parsed.bodyText,
        attachmentNames: parsed.attachmentNames,
        manualTags: parsed.manualTags
      });

      const placeholder: SupplierUpdate = result.placeholderUpdate;

      const payload = {
        ok: true as const,
        matchedSupplier: result.matchedSupplier,
        matchedDomain: result.matchedDomain,
        storedId: result.storedId,
        placeholderUpdate: placeholder,
        attachmentNames: result.attachmentNames,
        message: result.message
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }]
      };
    }
  );
}
