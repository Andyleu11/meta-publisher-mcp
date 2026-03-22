import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  listSupplierUpdatesSince,
  supplierUpdateRowToDto
} from '../db.js';
import {
  loadSuppliers,
  scanSupplierSocials,
  scanSupplierWebsites
} from '../supplierSources.js';
import type { SupplierUpdate } from '../supplierTypes.js';

const summarizeArgs = z.object({
  lookbackDays: z.number().optional().default(30)
});

type GroupedUpdate = {
  dateIso: string;
  source: string;
  title: string;
  summary: string;
  url: string;
  tags: string[];
};

type GroupedSupplier = {
  name: string;
  updates: GroupedUpdate[];
};

function groupUpdatesBySupplier(rows: SupplierUpdate[]): GroupedSupplier[] {
  const map = new Map<string, SupplierUpdate[]>();
  for (const r of rows) {
    const list = map.get(r.supplierName) ?? [];
    list.push(r);
    map.set(r.supplierName, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, updates]) => ({
      name,
      updates: updates
        .sort((x, y) => (x.dateIso < y.dateIso ? 1 : x.dateIso > y.dateIso ? -1 : 0))
        .map((u) => ({
          dateIso: u.dateIso,
          source: u.source,
          title: u.title,
          summary: u.summary,
          url: u.url,
          tags: u.tags
        }))
    }));
}

export function registerSupplierInsightsTools(mcpServer: McpServer): void {
  const m = mcpServer as {
    registerTool(
      name: string,
      config: { description: string; inputSchema: z.ZodObject<z.ZodRawShape> },
      handler: (args: unknown) => Promise<CallToolResult>
    ): void;
  };

  m.registerTool(
    'summarize_supplier_updates',
    {
      description:
        'Summarise recent supplier/manufacturer updates (SQLite `supplier_updates`: website / social / email) for drafting ideas — e.g. what is new from Polyflor or Armstrong this month. ' +
        'Runs light best-effort public HTML scans (unless `SCRAPING_ENABLED=false`), then reads rows in the lookback window. ' +
        'Heuristic only (JS-heavy sites may yield thin data). Use for inspiration only: rephrase in A to Z voice; do not copy supplier paragraphs; disclose installer-not-manufacturer. ' +
        'Does not auto-post; user approves before `schedule_post`.',
      inputSchema: summarizeArgs
    },
    async (args: unknown): Promise<CallToolResult> => {
      const { lookbackDays } = summarizeArgs.parse(args);
      void loadSuppliers();

      const insertedWebsite = await scanSupplierWebsites(lookbackDays);
      const insertedSocial = await scanSupplierSocials(lookbackDays);

      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(0, lookbackDays));
      const sinceIso = cutoff.toISOString().slice(0, 10);

      const storedRows = listSupplierUpdatesSince(sinceIso).map(
        supplierUpdateRowToDto
      );

      const suppliers = groupUpdatesBySupplier(storedRows);

      const payload: {
        lookbackDays: number;
        scanInsertedRows: { website: number; social: number };
        suppliers: GroupedSupplier[];
      } = {
        lookbackDays,
        scanInsertedRows: {
          website: insertedWebsite.length,
          social: insertedSocial.length
        },
        suppliers
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }]
      };
    }
  );
}
