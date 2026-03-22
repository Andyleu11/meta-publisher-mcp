#!/usr/bin/env node
/**
 * Walk a directory tree, compute SHA-256 (+ optional perceptual hash) for each image,
 * and write data/assets-manifest.json (no stdout JSON — use the manifest file).
 *
 * Git Bash: quote paths with spaces or & (use your real folder — not a placeholder):
 *   node scripts/hash-image-assets.mjs "C:/Dev/SocialAI/Advertising & Social Media Content"
 *   USE_PHASH=1 node scripts/hash-image-assets.mjs "C:/Dev/SocialAI/Advertising & Social Media Content"
 *
 * If the path is missing or no images are found, the script exits with an error and does not
 * overwrite an existing data/assets-manifest.json (unless ALLOW_EMPTY_MANIFEST=1 with 0 files).
 *
 * Optional perceptual hash: `sharp-phash` (and peer `sharp`) — set USE_PHASH=1.
 * ESM gives `import('sharp-phash').default` as the phash function.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);
const MANIFEST_REL = path.join('data', 'assets-manifest.json');
/** Stable log line (always forward slashes). */
const MANIFEST_LOG_PATH = 'data/assets-manifest.json';

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    console.error('Cannot read directory:', dir, e.message);
    process.exitCode = 1;
    return out;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walk(full, out);
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      if (EXT.has(ext)) out.push(full);
    }
  }
  return out;
}

async function maybePhash(buf) {
  if (process.env.USE_PHASH !== '1') return null;
  try {
    const mod = await import('sharp-phash');
    const phash = mod.default ?? mod.phash;
    if (typeof phash !== 'function') {
      throw new Error(
        'sharp-phash: expected default export function, got ' + typeof phash
      );
    }
    return await phash(buf);
  } catch (e) {
    console.warn(
      'USE_PHASH=1 but sharp-phash failed:',
      e instanceof Error ? e.message : String(e)
    );
    return null;
  }
}

function relPosix(fromRoot, filePath) {
  return path.relative(fromRoot, filePath).split(path.sep).join('/');
}

async function main() {
  const root =
    process.argv[2] ||
    process.env.AD_ASSETS_ROOT ||
    '';
  if (!root.trim()) {
    console.error(
      'Usage: node scripts/hash-image-assets.mjs "<path-to-folder>"\n' +
        '   or: AD_ASSETS_ROOT="C:/path" node scripts/hash-image-assets.mjs'
    );
    process.exit(1);
    return;
  }

  const resolvedRoot = path.resolve(root);
  let rootStat;
  try {
    rootStat = await fs.stat(resolvedRoot);
  } catch (e) {
    console.error(
      'Cannot open path (missing or not accessible):',
      resolvedRoot,
      e instanceof Error ? e.message : e
    );
    console.error('Manifest not updated.');
    process.exit(1);
    return;
  }
  if (!rootStat.isDirectory()) {
    console.error('Not a directory:', resolvedRoot);
    console.error('Manifest not updated.');
    process.exit(1);
    return;
  }

  const files = await walk(resolvedRoot);
  files.sort();

  if (files.length === 0 && process.env.ALLOW_EMPTY_MANIFEST !== '1') {
    console.error(
      'No image files found under:',
      resolvedRoot,
      '\nManifest not written (existing file left unchanged). Use ALLOW_EMPTY_MANIFEST=1 to write an empty manifest.'
    );
    process.exit(1);
    return;
  }

  const assets = [];
  for (const filePath of files) {
    const buf = await fs.readFile(filePath);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    const entry = {
      rel: relPosix(resolvedRoot, filePath),
      sha256: sha
    };
    const p = await maybePhash(buf);
    if (p) entry.phash = p;
    assets.push(entry);
  }

  const manifest = {
    root: resolvedRoot,
    count: assets.length,
    assets
  };

  const outPath = path.join(process.cwd(), MANIFEST_REL);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`Wrote ${manifest.count} assets to ${MANIFEST_LOG_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
