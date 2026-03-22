/**
 * Parse uploaded email files: `.eml` (mailparser), `.msg` (best-effort @kenjiuno/msgreader), `.zip` (nested .eml/.msg).
 * PDF / office attachment OCR is handled separately — see `extractAttachmentText.ts`.
 */

import { simpleParser } from 'mailparser';
import type { ParsedMail } from 'mailparser';
import AdmZip from 'adm-zip';
import MsgReader from '@kenjiuno/msgreader';
import type { FieldsData } from '@kenjiuno/msgreader';
import { guessContentTypeFromFilename } from './extractAttachmentText.js';

export type ParsedEmail = {
  fromAddress: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  sentAt?: string;
  attachments: {
    filename?: string;
    contentType: string;
    size: number;
    buffer: Buffer;
  }[];
};

function stripHtmlMinimal(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFromAddress(parsed: ParsedMail): string {
  const f = parsed.from;
  if (!f) return '';
  if (typeof f === 'string') return f;
  const first = f.value?.[0];
  if (first?.address) return first.address;
  return f.text ?? '';
}

export async function parseEmlBuffer(buffer: Buffer): Promise<ParsedEmail> {
  const parsed = await simpleParser(buffer);
  const textBody =
    (typeof parsed.text === 'string' && parsed.text.trim()
      ? parsed.text
      : '') ||
    (parsed.html ? stripHtmlMinimal(parsed.html) : '') ||
    '';

  const attachments: ParsedEmail['attachments'] = [];
  for (const a of parsed.attachments ?? []) {
    const buf = a.content;
    const size = Buffer.isBuffer(buf) ? buf.length : 0;
    attachments.push({
      filename: a.filename ?? undefined,
      contentType: a.contentType ?? 'application/octet-stream',
      size,
      buffer: Buffer.isBuffer(buf) ? buf : Buffer.from(buf ?? [])
    });
  }

  return {
    fromAddress: extractFromAddress(parsed),
    subject: parsed.subject ?? '(no subject)',
    textBody,
    htmlBody: typeof parsed.html === 'string' ? parsed.html : undefined,
    sentAt: parsed.date?.toISOString(),
    attachments
  };
}

function extractFromAddressFromMsg(data: FieldsData): string {
  const email = data.senderEmail?.trim();
  if (email && /@/.test(email) && !email.includes('/O=')) {
    return email;
  }
  const headers = data.headers;
  if (headers) {
    const m = headers.match(
      /From:\s*(?:[^<\n]*<([^>\s]+@[^>\s]+)>|([^\s<]+@[^\s>]+))/im
    );
    if (m) return (m[1] ?? m[2]).trim();
  }
  const name = data.senderName?.trim();
  if (name && /@/.test(name)) return name;
  return '';
}

function msgSentAtIso(data: FieldsData): string | undefined {
  const raw =
    data.messageDeliveryTime ?? data.clientSubmitTime ?? data.creationTime;
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function bodyTextFromMsg(data: FieldsData): string {
  const plain = (data.body ?? '').trim();
  if (plain) return plain;
  const bh = data.bodyHtml?.trim();
  if (bh) return stripHtmlMinimal(bh);
  if (data.html && data.html.byteLength > 0) {
    try {
      const html = Buffer.from(data.html).toString('utf8');
      return stripHtmlMinimal(html) || html.trim();
    } catch {
      /* ignore */
    }
  }
  return '';
}

function htmlBodyFromMsg(data: FieldsData): string | undefined {
  if (data.bodyHtml?.trim()) return data.bodyHtml;
  if (data.html && data.html.byteLength > 0) {
    try {
      return Buffer.from(data.html).toString('utf8');
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function parseMsgBuffer(buffer: Buffer): Promise<ParsedEmail> {
  try {
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
    const reader = new MsgReader(arrayBuffer);
    const data = reader.getFileData();

    if (data.error) {
      throw new Error(String(data.error));
    }

    const textBody = bodyTextFromMsg(data);
    const htmlBody = htmlBodyFromMsg(data);
    const attachments: ParsedEmail['attachments'] = [];

    for (const attMeta of data.attachments ?? []) {
      if (attMeta.innerMsgContent) continue;
      try {
        const got = reader.getAttachment(attMeta);
        const buf = Buffer.from(got.content);
        const fname = got.fileName || 'attachment';
        attachments.push({
          filename: fname,
          contentType: guessContentTypeFromFilename(fname),
          size: buf.length,
          buffer: buf
        });
      } catch (e) {
        console.warn('[parseEmailFile] MSG attachment skipped:', e);
      }
    }

    return {
      fromAddress: extractFromAddressFromMsg(data),
      subject: (data.subject ?? '(no subject)').trim() || '(no subject)',
      textBody,
      htmlBody,
      sentAt: msgSentAtIso(data),
      attachments
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[parseEmailFile] MSG parse failed: ${msg}`);
    throw new Error(`MSG parse failed: ${msg}`);
  }
}

export type ParsedEmailFileKind = 'eml' | 'msg' | 'zip' | 'unknown';

export function detectEmailFileKind(filename: string): ParsedEmailFileKind {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.eml')) return 'eml';
  if (lower.endsWith('.msg')) return 'msg';
  if (lower.endsWith('.zip')) return 'zip';
  return 'unknown';
}

/**
 * Parse one file buffer by extension. For .zip, returns multiple virtual results (caller iterates).
 */
export async function parseEmailFile(
  buffer: Buffer,
  filename: string
): Promise<ParsedEmail[]> {
  const kind = detectEmailFileKind(filename);

  if (kind === 'unknown') {
    console.warn(`[parseEmailFile] Unrecognised extension: ${filename}`);
    throw new Error(`Unrecognised email file type: ${filename}`);
  }

  if (kind === 'zip') {
    const zip = new AdmZip(buffer);
    const out: ParsedEmail[] = [];
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const name = entry.entryName;
      const innerKind = detectEmailFileKind(name);
      if (innerKind !== 'eml' && innerKind !== 'msg') continue;
      const data = entry.getData();
      if (innerKind === 'eml') {
        out.push(await parseEmlBuffer(data));
      } else {
        try {
          out.push(await parseMsgBuffer(data));
        } catch (e) {
          console.warn(`[parseEmailFile] Skip ${name}:`, e);
        }
      }
    }
    if (out.length === 0) {
      throw new Error(
        'ZIP contained no .eml/.msg files, or .msg entries could not be parsed.'
      );
    }
    return out;
  }

  if (kind === 'eml') {
    return [await parseEmlBuffer(buffer)];
  }

  return [await parseMsgBuffer(buffer)];
}
