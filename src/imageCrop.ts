import { getMeta } from './db.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = join(process.cwd(), 'data', 'generated-images');

function ensureOutputDir(): void {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

/**
 * If auto-crop is enabled in settings, crops the bottom-right area of the image
 * to remove potential watermarks. Returns the path to the (possibly cropped) file.
 *
 * Uses sharp for resizing/cropping. If sharp is unavailable, saves the original.
 */
export async function processGeneratedImage(
  imageBuffer: Buffer,
  filename: string,
): Promise<{ filePath: string; wasCropped: boolean }> {
  ensureOutputDir();

  const autoCrop = getMeta('image_gen_auto_crop') === 'true';
  if (!autoCrop) {
    const filePath = join(OUTPUT_DIR, filename);
    writeFileSync(filePath, imageBuffer);
    return { filePath, wasCropped: false };
  }

  const bottomPct = Math.min(50, Math.max(0, parseInt(getMeta('image_gen_crop_bottom_pct') ?? '10', 10) || 10));
  const rightPct = Math.min(50, Math.max(0, parseInt(getMeta('image_gen_crop_right_pct') ?? '15', 10) || 15));

  try {
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width ?? 1024;
    const height = metadata.height ?? 1024;

    const cropWidth = Math.round(width * (1 - rightPct / 100));
    const cropHeight = Math.round(height * (1 - bottomPct / 100));

    const cropped = await sharp(imageBuffer)
      .extract({ left: 0, top: 0, width: cropWidth, height: cropHeight })
      .toBuffer();

    const filePath = join(OUTPUT_DIR, filename);
    writeFileSync(filePath, cropped);
    return { filePath, wasCropped: true };
  } catch (e) {
    console.warn('[imageCrop] sharp crop failed, saving original:', e instanceof Error ? e.message : e);
    const filePath = join(OUTPUT_DIR, filename);
    writeFileSync(filePath, imageBuffer);
    return { filePath, wasCropped: false };
  }
}

export function shouldRequireImageReview(): boolean {
  return getMeta('image_gen_require_review') === 'true';
}
