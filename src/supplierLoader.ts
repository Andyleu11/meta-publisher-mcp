import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { Supplier } from './supplierTypes.js';

export function loadSuppliers(): Supplier[] {
  const file = join(process.cwd(), 'suppliers.json');
  if (!existsSync(file)) {
    return [];
  }
  const raw = readFileSync(file, 'utf8');
  return JSON.parse(raw) as Supplier[];
}
