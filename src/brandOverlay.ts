import { getMeta } from './db.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

const OUTPUT_DIR = join(process.cwd(), 'data', 'generated-images');

function ensureOutputDir(): void {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

export type OverlayPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center';

const GRAVITY_MAP: Record<OverlayPosition, string> = {
  'top-left': 'northwest',
  'top-right': 'northeast',
  'bottom-left': 'southwest',
  'bottom-right': 'southeast',
  'center': 'centre',
};

export function isBrandOverlayEnabled(): boolean {
  return getMeta('brand_overlay_enabled') === 'true';
}

export function getBrandOverlayConfig() {
  return {
    enabled: getMeta('brand_overlay_enabled') === 'true',
    logoPath: getMeta('brand_overlay_logo_path') ?? '',
    position: (getMeta('brand_overlay_position') ?? 'bottom-right') as OverlayPosition,
    opacity: Math.min(100, Math.max(5, parseInt(getMeta('brand_overlay_opacity') ?? '80', 10) || 80)),
    scalePct: Math.min(80, Math.max(3, parseInt(getMeta('brand_overlay_scale_pct') ?? '15', 10) || 15)),
    margin: Math.max(0, parseInt(getMeta('brand_overlay_margin_px') ?? '20', 10) || 20),
  };
}

/**
 * Composite the brand logo onto an image buffer.
 * Returns the branded image buffer, or the original if overlay is not configured.
 */
export async function applyBrandOverlay(imageBuffer: Buffer): Promise<{
  buffer: Buffer;
  applied: boolean;
}> {
  const config = getBrandOverlayConfig();

  if (!config.enabled || !config.logoPath) {
    return { buffer: imageBuffer, applied: false };
  }

  if (!existsSync(config.logoPath)) {
    console.warn(`[brandOverlay] Logo file not found: ${config.logoPath}`);
    return { buffer: imageBuffer, applied: false };
  }

  try {
    const sharp = (await import('sharp')).default;

    const baseMetadata = await sharp(imageBuffer).metadata();
    const baseWidth = baseMetadata.width ?? 1024;
    const baseHeight = baseMetadata.height ?? 1024;

    const logoBuffer = readFileSync(config.logoPath);
    const targetWidth = Math.round(baseWidth * (config.scalePct / 100));

    let resizedLogo = await sharp(logoBuffer)
      .resize({ width: targetWidth, withoutEnlargement: true })
      .toBuffer();

    if (config.opacity < 100) {
      const logoMeta = await sharp(resizedLogo).metadata();
      const channels = logoMeta.channels ?? 4;
      if (channels < 4) {
        resizedLogo = await sharp(resizedLogo).ensureAlpha().toBuffer();
      }
      resizedLogo = await sharp(resizedLogo)
        .ensureAlpha(config.opacity / 100)
        .toBuffer();
    }

    const logoMeta = await sharp(resizedLogo).metadata();
    const logoW = logoMeta.width ?? targetWidth;
    const logoH = logoMeta.height ?? targetWidth;
    const margin = config.margin;

    let top = margin;
    let left = margin;

    switch (config.position) {
      case 'top-left':
        top = margin;
        left = margin;
        break;
      case 'top-right':
        top = margin;
        left = baseWidth - logoW - margin;
        break;
      case 'bottom-left':
        top = baseHeight - logoH - margin;
        left = margin;
        break;
      case 'bottom-right':
        top = baseHeight - logoH - margin;
        left = baseWidth - logoW - margin;
        break;
      case 'center':
        top = Math.round((baseHeight - logoH) / 2);
        left = Math.round((baseWidth - logoW) / 2);
        break;
    }

    top = Math.max(0, top);
    left = Math.max(0, left);

    const result = await sharp(imageBuffer)
      .composite([{ input: resizedLogo, top, left }])
      .toBuffer();

    return { buffer: result, applied: true };
  } catch (e) {
    console.warn('[brandOverlay] Overlay failed, returning original:', e instanceof Error ? e.message : e);
    return { buffer: imageBuffer, applied: false };
  }
}

/**
 * Apply brand overlay to a file on disk. Reads the file, applies overlay, writes a new file.
 * Returns the new filename and path.
 */
export async function applyBrandOverlayToFile(inputPath: string): Promise<{
  filename: string;
  filePath: string;
  applied: boolean;
}> {
  ensureOutputDir();

  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const imageBuffer = readFileSync(inputPath);
  const { buffer, applied } = await applyBrandOverlay(imageBuffer);

  const filename = `branded-${crypto.randomBytes(8).toString('hex')}.png`;
  const filePath = join(OUTPUT_DIR, filename);
  writeFileSync(filePath, buffer);

  return { filename, filePath, applied };
}
