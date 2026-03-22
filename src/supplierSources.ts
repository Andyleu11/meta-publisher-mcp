/**
 * Supplier / manufacturer content sources — barrel module.
 *
 * Workflow (see docs/supplier-content-sources.md):
 * - Supplier **names** are seeded from `flooring-suppliers.CSV` → `suppliers.json` (e.g. `npm run gen:suppliers`).
 * - **Website / Facebook / Instagram** are filled manually or via assisted web lookup (not auto-guessed here).
 * - **emailDomains** map incoming mail (`ingest_supplier_email`) to the right supplier stream.
 * - **allowScrape** / **allowEmailContent** are per-supplier kill-switches for future scanners and email ingestion.
 *
 * Watcher scope (product/technical): see `src/supplierWatcher.ts`.
 *
 * COMPLIANCE: Respect each supplier’s website Terms of Use, copyright, and trademark rules.
 * Use only information you are entitled to use for your own marketing. Email content may
 * contain confidential terms — handle under your retention policy and do not republish
 * proprietary attachments without permission.
 */

export type { Supplier, SupplierUpdate } from './supplierTypes.js';
export { loadSuppliers } from './supplierLoader.js';
export { scanSupplierWebsites, scanSupplierSocials } from './supplierWatcher.js';

import { insertSupplierUpdate } from './db.js';
import type { SupplierUpdate } from './supplierTypes.js';

export async function storeSupplierUpdate(
  update: Omit<SupplierUpdate, 'id'> & { id?: number }
): Promise<number> {
  if (update.id !== undefined && update.id > 0) {
    // TODO: UPDATE supplier_updates WHERE id = ? when edits are needed.
    return update.id;
  }
  return insertSupplierUpdate({
    supplierName: update.supplierName,
    dateIso: update.dateIso,
    source: update.source,
    url: update.url,
    title: update.title,
    summary: update.summary,
    tags: update.tags
  });
}
