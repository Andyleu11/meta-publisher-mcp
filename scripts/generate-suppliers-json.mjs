/**
 * Regenerates `suppliers.json` from `flooring-suppliers.CSV` (first column `Supplier`).
 * Run from repo root: `node scripts/generate-suppliers-json.mjs`
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = join(root, 'flooring-suppliers.CSV');
const outPath = join(root, 'suppliers.json');

const text = readFileSync(csvPath, 'utf8');
const lines = text
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);
const names = lines.slice(1).filter((l) => l && !l.startsWith('#'));
const uniq = [...new Set(names)].sort((a, b) =>
  a.localeCompare(b, 'en', { sensitivity: 'base' })
);

const out = uniq.map((name) => ({
  name,
  website: '',
  facebookPageUrl: '',
  instagramHandle: '',
  emailDomains: [],
  allowScrape: true,
  allowEmailContent: true
}));

writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${out.length} suppliers to suppliers.json`);
