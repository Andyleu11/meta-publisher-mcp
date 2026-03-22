import { loadSuppliers, storeSupplierUpdate, type SupplierUpdate } from './supplierSources.js';
import {
  attachmentNameTags,
  extractEmailSignalTags
} from './supplierEmailHints.js';

export type IngestSupplierEmailInput = {
  fromEmail: string;
  subject: string;
  bodyText: string;
  attachmentNames?: string[];
  /** Merged into tags (e.g. "Polyflor promo", "Hybrid technical bulletin"). */
  manualTags?: string[];
};

function domainFromEmail(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  return email.slice(at + 1).trim().toLowerCase() || null;
}

export function matchSupplierByDomain(
  fromEmail: string,
  suppliers: ReturnType<typeof loadSuppliers>
): { supplier: (typeof suppliers)[0] | null; matchedDomain: string | null } {
  const domain = domainFromEmail(fromEmail);
  if (!domain) return { supplier: null, matchedDomain: null };
  for (const s of suppliers) {
    for (const d of s.emailDomains) {
      if (!d) continue;
      const normalized = d.replace(/^@/, '').trim().toLowerCase();
      if (domain === normalized) {
        return { supplier: s, matchedDomain: domain };
      }
    }
  }
  return { supplier: null, matchedDomain: domain };
}

export type IngestSupplierEmailResult = {
  ok: true;
  matchedSupplier: string | null;
  matchedDomain: string | null;
  storedId: number | null;
  placeholderUpdate: SupplierUpdate;
  attachmentNames: string[];
  message: string;
};

/**
 * Core logic for `ingest_supplier_email` (MCP + HTTP upload). Does not post to social media.
 */
export async function ingestSupplierEmailCore(
  input: IngestSupplierEmailInput
): Promise<IngestSupplierEmailResult> {
  const suppliers = loadSuppliers();
  const { supplier, matchedDomain } = matchSupplierByDomain(
    input.fromEmail,
    suppliers
  );

  const manual =
    input.manualTags?.map((t) => t.trim()).filter(Boolean) ?? [];
  const hintTags = extractEmailSignalTags(input.subject, input.bodyText);
  const attachTags = attachmentNameTags(input.attachmentNames);
  const tags = [
    ...hintTags,
    ...attachTags,
    ...manual.map((t) => `manual:${t}`),
    ...(matchedDomain ? [`domain:${matchedDomain}`] : [])
  ];
  const uniqueTags = [...new Set(tags)];

  const dateIso = new Date().toISOString();
  const summary =
    input.bodyText.slice(0, 500) +
    (input.bodyText.length > 500 ? '…' : '');

  let storedId: number | null = null;
  let persistMessage: string;

  if (!supplier) {
    persistMessage =
      'No supplier matched on emailDomains — nothing written to supplier_updates. Add domains in suppliers.json.';
  } else if (!supplier.allowEmailContent) {
    persistMessage = `Supplier "${supplier.name}" has allowEmailContent=false — row not stored.`;
  } else {
    storedId = await storeSupplierUpdate({
      supplierName: supplier.name,
      dateIso,
      source: 'email',
      url: '',
      title: input.subject,
      summary,
      tags: uniqueTags
    });
    persistMessage = `Stored supplier_updates id=${storedId} (source=email). PDF attachment text may be stored separately in email_attachments_text when extracted.`;
  }

  const placeholder: SupplierUpdate = {
    id: storedId ?? 0,
    supplierName: supplier?.name ?? '(no supplier match)',
    dateIso,
    source: 'email',
    url: '',
    title: input.subject,
    summary,
    tags: uniqueTags
  };

  return {
    ok: true,
    matchedSupplier: supplier?.name ?? null,
    matchedDomain,
    storedId,
    placeholderUpdate: placeholder,
    attachmentNames: input.attachmentNames ?? [],
    message: persistMessage
  };
}
