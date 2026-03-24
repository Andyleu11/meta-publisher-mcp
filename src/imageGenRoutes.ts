import type { Express, Request, Response } from 'express';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getMeta, insertErrorLog } from './db.js';
import { processGeneratedImage, shouldRequireImageReview } from './imageCrop.js';
import { applyBrandOverlay, applyBrandOverlayToFile, isBrandOverlayEnabled } from './brandOverlay.js';
import { withRetry } from './retry.js';
import crypto from 'crypto';

async function generateWithOpenAI(apiKey: string, prompt: string): Promise<Buffer> {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI Images API ${response.status}: ${text.slice(0, 300)}`);
  }
  const json = (await response.json()) as { data: Array<{ b64_json: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image data returned from OpenAI');
  return Buffer.from(b64, 'base64');
}

async function generateWithStability(apiKey: string, prompt: string): Promise<Buffer> {
  const response = await fetch(
    'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        text_prompts: [{ text: prompt, weight: 1 }],
        cfg_scale: 7,
        height: 1024,
        width: 1024,
        samples: 1,
      }),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Stability API ${response.status}: ${text.slice(0, 300)}`);
  }
  const json = (await response.json()) as { artifacts: Array<{ base64: string }> };
  const b64 = json.artifacts?.[0]?.base64;
  if (!b64) throw new Error('No image data returned from Stability');
  return Buffer.from(b64, 'base64');
}

export function registerImageGenRoutes(app: Express): void {
  app.post('/api/generate-image', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      if (!prompt) {
        res.status(400).json({ ok: false, message: 'prompt is required' });
        return;
      }

      const provider = getMeta('image_gen_provider') ?? 'openai';
      const apiKey = getMeta('image_gen_api_key');
      if (!apiKey) {
        res.status(400).json({
          ok: false,
          message: 'No image generation API key configured. Go to Settings.',
        });
        return;
      }

      let imageBuffer: Buffer;
      if (provider === 'stability') {
        imageBuffer = await withRetry(() => generateWithStability(apiKey, prompt), 'ImageGen (stability)');
      } else {
        imageBuffer = await withRetry(() => generateWithOpenAI(apiKey, prompt), 'ImageGen (openai)');
      }

      const filename = `ai-${crypto.randomBytes(8).toString('hex')}.png`;
      const { filePath, wasCropped } = await processGeneratedImage(imageBuffer, filename);

      let brandApplied = false;
      const skipBrand = body.skipBrandOverlay === true;
      if (!skipBrand && isBrandOverlayEnabled()) {
        try {
          const processed = readFileSync(filePath);
          const { buffer, applied } = await applyBrandOverlay(processed);
          if (applied) {
            const { writeFileSync } = await import('fs');
            writeFileSync(filePath, buffer);
            brandApplied = true;
          }
        } catch (e) {
          console.warn('[image-gen] brand overlay failed:', e instanceof Error ? e.message : e);
        }
      }

      const requiresReview = shouldRequireImageReview();

      res.json({
        ok: true,
        image: {
          filename,
          filePath,
          wasCropped,
          brandApplied,
          requiresReview,
          provider,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      insertErrorLog('image-gen', msg);
      res.status(500).json({ ok: false, message: msg });
    }
  });

  /**
   * POST /api/apply-brand-overlay
   * Apply the brand logo overlay to an existing image.
   * Body: { imagePath: string } — path relative to generated-images dir, or an absolute asset library path.
   */
  app.post('/api/apply-brand-overlay', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const imagePath = typeof body.imagePath === 'string' ? body.imagePath.trim() : '';
      if (!imagePath) {
        res.status(400).json({ ok: false, message: 'imagePath is required' });
        return;
      }

      if (!isBrandOverlayEnabled()) {
        res.status(400).json({
          ok: false,
          message: 'Brand overlay is not enabled. Go to Settings > Brand Logo Overlay.',
        });
        return;
      }

      // Resolve: could be a generated-images filename, a relative path, or an absolute asset path
      let resolvedPath = imagePath;
      if (!existsSync(resolvedPath)) {
        const genDir = join(process.cwd(), 'data', 'generated-images');
        const tryGen = join(genDir, imagePath);
        if (existsSync(tryGen)) {
          resolvedPath = tryGen;
        } else {
          const libPath = getMeta('asset_library_path');
          if (libPath) {
            const tryLib = join(libPath, imagePath);
            if (existsSync(tryLib) && tryLib.startsWith(libPath)) {
              resolvedPath = tryLib;
            }
          }
        }
      }

      if (!existsSync(resolvedPath)) {
        res.status(400).json({ ok: false, message: `Image not found: ${imagePath}` });
        return;
      }

      const { filename, filePath, applied } = await applyBrandOverlayToFile(resolvedPath);
      res.json({
        ok: true,
        image: {
          filename,
          filePath,
          applied,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      insertErrorLog('brand-overlay', msg);
      res.status(500).json({ ok: false, message: msg });
    }
  });
}
