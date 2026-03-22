/**
 * Lightweight keyword hints for supplier email ingest (not NLP — safe defaults only).
 * TODO: replace with proper extraction / OCR text from attachments.
 */

const PROMO = /\b(sale|promo|promotion|%\s*off|\d+\s*%|discount|clearance|eofy|bonus|special offer)\b/i;
const NEW_PRODUCT = /\b(new launch|new product|introducing|now available|new range|sku|stock\s*keeping)\b/i;
const TECH = /\b(waterproof|low\s*voc|voc|ac\s*\d|slip\s*r|r10|r11|warranty|installation|technical|tds|msds)\b/i;
const DATES = /\b(20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i;

export function extractEmailSignalTags(
  subject: string,
  bodyText: string
): string[] {
  const text = `${subject}\n${bodyText}`;
  const tags: string[] = ['email'];

  if (PROMO.test(text)) tags.push('signal:promotion');
  if (NEW_PRODUCT.test(text)) tags.push('signal:new-product');
  if (TECH.test(text)) tags.push('signal:technical');
  if (DATES.test(text) && PROMO.test(text)) tags.push('signal:dated-offer');

  return [...new Set(tags)];
}

export function attachmentNameTags(names: string[] | undefined): string[] {
  if (!names?.length) return [];
  const out: string[] = [];
  for (const n of names) {
    const lower = n.toLowerCase();
    if (lower.endsWith('.pdf')) out.push('attachment:pdf');
    else if (/\.(png|jpe?g|webp|gif)$/.test(lower)) out.push('attachment:image');
    else if (lower.length) out.push('attachment:file');
  }
  return [...new Set(out)];
}
