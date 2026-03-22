/**
 * Best-effort plaintext from attachments (text-based PDFs only; no OCR).
 */
import { readFile } from 'fs/promises';
import { extname } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// pdf-parse v1 — CommonJS; avoids heavier pdf-parse v2 / canvas stack.
const pdfParse = require('pdf-parse') as (
  data: Buffer
) => Promise<{ text?: string }>;

const PDF_MAX_BYTES = 50 * 1024 * 1024;

/** Guess MIME type from filename for saved attachment paths (no magic-byte sniff). */
export function guessContentTypeFromFilename(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  return map[ext] ?? 'application/octet-stream';
}

export async function extractTextFromAttachment(
  filePath: string,
  contentType: string
): Promise<string | null> {
  const ct = contentType.trim().toLowerCase();
  if (!ct.startsWith('application/pdf')) {
    return null;
  }

  let buf: Buffer;
  try {
    buf = await readFile(filePath);
  } catch (e) {
    console.warn(`[extractAttachmentText] read failed ${filePath}:`, e);
    return null;
  }

  if (buf.length > PDF_MAX_BYTES) {
    console.warn(
      `[extractAttachmentText] PDF too large (${buf.length} bytes), skip: ${filePath}`
    );
    return null;
  }

  try {
    const data = await pdfParse(buf);
    const raw = typeof data.text === 'string' ? data.text : '';
    const t = raw.replace(/\u0000/g, '').trim();
    return t.length > 0 ? t : null;
  } catch (e) {
    console.warn(`[extractAttachmentText] PDF parse failed ${filePath}:`, e);
    return null;
  }
}
