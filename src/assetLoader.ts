/**
 * In-memory cache of `data/assets-manifest.json` (from `scripts/hash-image-assets.mjs`).
 * Loaded at MCP / health server startup; safe if file is missing.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export type ManifestAsset = {
  rel: string;
  sha256: string;
  phash?: string;
};

const MANIFEST_PATH = join(process.cwd(), 'data', 'assets-manifest.json');

let cachedAssets: ManifestAsset[] = [];
let cachedScanRoot: string | null = null;

function parseManifestAsset(x: unknown): ManifestAsset | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.rel !== 'string' || typeof o.sha256 !== 'string') return null;
  const out: ManifestAsset = { rel: o.rel, sha256: o.sha256 };
  if (typeof o.phash === 'string') out.phash = o.phash;
  return out;
}

/**
 * Read and cache the manifest. Idempotent; logs a warning if missing or invalid (does not throw).
 */
export function loadAssetManifest(): void {
  cachedAssets = [];
  cachedScanRoot = null;

  if (!existsSync(MANIFEST_PATH)) {
    console.warn(
      '[assets] data/assets-manifest.json missing — run: node scripts/hash-image-assets.mjs "<asset-folder>" (optional USE_PHASH=1)'
    );
    return;
  }

  try {
    const raw = readFileSync(MANIFEST_PATH, 'utf8');
    const j = JSON.parse(raw) as { root?: unknown; assets?: unknown };
    if (typeof j.root === 'string') cachedScanRoot = j.root;
    if (!Array.isArray(j.assets)) {
      console.warn('[assets] assets-manifest.json: "assets" is not an array — using empty list');
      return;
    }
    const next: ManifestAsset[] = [];
    for (const item of j.assets) {
      const row = parseManifestAsset(item);
      if (row) next.push(row);
    }
    cachedAssets = next;
  } catch (e) {
    console.warn(
      '[assets] Failed to read assets-manifest.json:',
      e instanceof Error ? e.message : e
    );
    cachedAssets = [];
  }
}

export function getAvailableAssets(): ManifestAsset[] {
  return cachedAssets;
}

/** Directory that was hashed when the manifest was generated (JSON `root`), if present. */
export function getManifestScanRoot(): string | null {
  return cachedScanRoot;
}

function normalizePathPart(raw: string): { pathPart: string; base: string } {
  let s = raw.trim();
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      s = decodeURIComponent(u.pathname);
    } catch {
      /* keep */
    }
  }
  s = s.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = s.split('/').filter(Boolean);
  const base = parts.length ? parts[parts.length - 1]! : s;
  return { pathPart: s, base };
}

function relMatchesImageRef(rel: string, pathPart: string, base: string): boolean {
  const r = rel.replace(/\\/g, '/').toLowerCase();
  const p = pathPart.toLowerCase();
  const b = base.toLowerCase();
  if (r === p || r === b) return true;
  if (p && (r.endsWith('/' + p) || r.endsWith('/' + b))) return true;
  const relBase = (r.split('/').pop() || r).toLowerCase();
  return relBase === b || relBase === p;
}

/**
 * True if there is no `imageUrl`, or the manifest is empty (no enforcement), or some manifest `rel` matches.
 */
export function isImageUrlInManifest(imageUrl: string | null | undefined): boolean {
  if (!imageUrl?.trim()) return true;
  if (cachedAssets.length === 0) return true;
  const { pathPart, base } = normalizePathPart(imageUrl);
  return cachedAssets.some((a) => relMatchesImageRef(a.rel, pathPart, base));
}

export function assetMatchesCategory(
  rel: string,
  filter: 'brand-tiles' | 'photos'
): boolean {
  const r = rel.replace(/\\/g, '/').toLowerCase();
  const brandish =
    /tile|step[_\s-]?\d|brand|guide|trust|vision|guarantee|skip|overwhelm|floored|limited|simplified|experts|offers/i.test(
      r
    );
  if (filter === 'brand-tiles') return brandish;
  return !brandish;
}
