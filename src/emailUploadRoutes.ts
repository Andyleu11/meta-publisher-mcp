/**
 * POST /api/upload-email — multipart upload of .eml / .msg / .zip for supplier marketing ingestion.
 * Does not expose full email body in JSON responses (metadata + ingest result only).
 *
 * TODO: S3/object storage for attachments in production.
 * TODO: Rate limiting and auth for production.
 */

import type { Express, Request, Response } from 'express';
import multer from 'multer';
import { mkdirSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { randomUUID } from 'crypto';
import { parseEmailFile } from './utils/parseEmailFile.js';
import { ingestSupplierEmailCore } from './supplierEmailIngest.js';
import { extractTextFromAttachment } from './utils/extractAttachmentText.js';
import { insertEmailAttachmentText } from './db.js';

const RAW_DIR = join(process.cwd(), 'data', 'emails', 'raw');
const ATTACH_DIR = join(process.cwd(), 'data', 'emails', 'attachments');

/** Inline PDF text extraction for small files only (full backfill: `npm run extract:attachments`). */
const UPLOAD_PDF_TEXT_MAX_BYTES = 5 * 1024 * 1024;

function ensureDirs(): void {
  mkdirSync(RAW_DIR, { recursive: true });
  mkdirSync(ATTACH_DIR, { recursive: true });
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 20 }
});

export type UploadEmailPublicSummary = {
  fromEmail: string;
  subject: string;
  matchedSupplier: string | null;
  storedId: number | null;
  attachmentNames: string[];
  message: string;
};

export function registerEmailUploadRoutes(app: Express): void {
  const enabled = process.env.UPLOAD_EMAIL_API_ENABLED !== 'false';

  app.post(
    '/api/upload-email',
    upload.array('files', 20),
    async (req: Request, res: Response) => {
      if (!enabled) {
        res.status(503).json({ error: 'Upload API disabled (UPLOAD_EMAIL_API_ENABLED=false).' });
        return;
      }

      const files = req.files as Express.Multer.File[] | undefined;
      if (!files?.length) {
        res.status(400).json({ error: 'No files (use field name "files").' });
        return;
      }

      const manualTagsRaw = req.body?.manualTags as string | undefined;
      const manualTags = manualTagsRaw
        ? manualTagsRaw
            .split(/[,;\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      ensureDirs();

      const fileResults: Array<{
        id: string;
        filename: string;
        status: 'ok' | 'error';
        error?: string;
        ingestions?: UploadEmailPublicSummary[];
      }> = [];

      for (const file of files) {
        const id = randomUUID();
        const rawPath = join(RAW_DIR, `${id}-${safeFilename(file.originalname)}`);
        try {
          writeFileSync(rawPath, file.buffer);
        } catch (e) {
          console.warn('[upload-email] Failed to save raw file', e);
        }

        try {
          const parsedList = await parseEmailFile(file.buffer, file.originalname);
          const ingestions: UploadEmailPublicSummary[] = [];

          for (const parsed of parsedList) {
            const savedNames: string[] = [];
            const savedAtts: Array<{
              diskPath: string;
              contentType: string;
              size: number;
            }> = [];
            let idx = 0;
            for (const att of parsed.attachments) {
              idx += 1;
              const base =
                att.filename && att.filename.length > 0
                  ? safeFilename(att.filename)
                  : `attachment-${idx}`;
              const attPath = join(ATTACH_DIR, `${randomUUID()}-${base}`);
              try {
                writeFileSync(attPath, att.buffer);
                savedNames.push(base);
                savedAtts.push({
                  diskPath: attPath,
                  contentType: att.contentType,
                  size: att.size
                });
              } catch (e) {
                console.warn('[upload-email] Attachment save failed', e);
              }
            }

            const bodyText = parsed.textBody || '';

            const result = await ingestSupplierEmailCore({
              fromEmail: parsed.fromAddress || 'unknown@invalid.local',
              subject: parsed.subject,
              bodyText,
              attachmentNames: savedNames,
              manualTags: manualTags.length ? manualTags : undefined
            });

            const supplierName = result.matchedSupplier ?? '';
            for (const s of savedAtts) {
              const ct = s.contentType.toLowerCase();
              if (!ct.startsWith('application/pdf')) continue;
              if (s.size >= UPLOAD_PDF_TEXT_MAX_BYTES) continue;
              try {
                const text = await extractTextFromAttachment(
                  s.diskPath,
                  s.contentType
                );
                if (text) {
                  insertEmailAttachmentText({
                    supplierName,
                    filename: basename(s.diskPath),
                    contentType: s.contentType,
                    text
                  });
                }
              } catch (e) {
                console.warn('[upload-email] PDF text extraction failed', e);
              }
            }

            ingestions.push({
              fromEmail: parsed.fromAddress,
              subject: parsed.subject,
              matchedSupplier: result.matchedSupplier,
              storedId: result.storedId,
              attachmentNames: savedNames,
              message: result.message
            });
          }

          fileResults.push({
            id,
            filename: file.originalname,
            status: 'ok',
            ingestions
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`[upload-email] Parse failed ${file.originalname}:`, msg);
          fileResults.push({
            id,
            filename: file.originalname,
            status: 'error',
            error: msg
          });
        }
      }

      res.json({ ok: true, results: fileResults });
    }
  );
}
