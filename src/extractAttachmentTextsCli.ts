/**
 * Backfill: extract PDF text for files in data/emails/attachments/ into email_attachments_text.
 * Run: npm run extract:attachments
 */
import { mkdirSync } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join, basename } from 'path';
import {
  initSchema,
  hasEmailAttachmentText,
  insertEmailAttachmentText
} from './db.js';
import {
  extractTextFromAttachment,
  guessContentTypeFromFilename
} from './utils/extractAttachmentText.js';

const ATTACH_DIR = join(process.cwd(), 'data', 'emails', 'attachments');

async function main(): Promise<void> {
  initSchema();
  mkdirSync(ATTACH_DIR, { recursive: true });
  let names: string[];
  try {
    names = await readdir(ATTACH_DIR);
  } catch (e) {
    console.error(`Cannot read ${ATTACH_DIR}:`, e);
    process.exitCode = 1;
    return;
  }

  let processed = 0;
  let skipped = 0;

  for (const name of names) {
    const filePath = join(ATTACH_DIR, name);
    const st = await stat(filePath).catch(() => null);
    if (!st?.isFile()) continue;

    if (hasEmailAttachmentText(name)) {
      skipped += 1;
      continue;
    }

    const contentType = guessContentTypeFromFilename(name);
    const text = await extractTextFromAttachment(filePath, contentType);
    if (text === null) continue;

    insertEmailAttachmentText({
      supplierName: '',
      filename: basename(name),
      contentType,
      text
    });
    processed += 1;
    console.log(`[extract:attachments] stored text for ${name}`);
  }

  console.log(
    `[extract:attachments] done — inserted/updated ${processed}, skipped (already had row) ${skipped}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
