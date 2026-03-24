import type { Express, Request, Response } from 'express';
import { readdirSync, statSync, existsSync } from 'fs';
import { join, extname, relative } from 'path';
import { getMeta } from './db.js';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif']);

interface AssetEntry {
  name: string;
  path: string;
  type: 'image' | 'directory';
  sizeBytes?: number;
}

function listDir(dir: string, subPath: string): AssetEntry[] {
  const full = subPath ? join(dir, subPath) : dir;
  if (!existsSync(full)) return [];

  const entries: AssetEntry[] = [];
  for (const name of readdirSync(full)) {
    if (name.startsWith('.')) continue;
    const filePath = join(full, name);
    try {
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        entries.push({
          name,
          path: subPath ? `${subPath}/${name}` : name,
          type: 'directory',
        });
      } else if (IMAGE_EXTS.has(extname(name).toLowerCase())) {
        entries.push({
          name,
          path: subPath ? `${subPath}/${name}` : name,
          type: 'image',
          sizeBytes: stat.size,
        });
      }
    } catch {
      // skip unreadable entries
    }
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

export function registerAssetLibraryRoutes(app: Express): void {
  app.get('/api/asset-library', (req: Request, res: Response) => {
    const libraryPath = getMeta('asset_library_path');
    if (!libraryPath) {
      res.status(400).json({
        ok: false,
        message: 'No asset library path configured. Set it in Settings.',
      });
      return;
    }
    if (!existsSync(libraryPath)) {
      res.status(400).json({
        ok: false,
        message: `Asset library path does not exist: ${libraryPath}`,
      });
      return;
    }

    const subPath = typeof req.query.path === 'string' ? req.query.path : '';

    // Prevent path traversal
    const resolved = join(libraryPath, subPath);
    if (!resolved.startsWith(libraryPath)) {
      res.status(400).json({ ok: false, message: 'Invalid path' });
      return;
    }

    try {
      const entries = listDir(libraryPath, subPath);
      res.json({
        ok: true,
        root: libraryPath,
        currentPath: subPath || '/',
        entries,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, message: msg });
    }
  });
}
