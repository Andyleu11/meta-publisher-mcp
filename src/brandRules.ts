/**
 * Brand / content-safety rules — loaded from `config/brand-rules.json` at process start.
 * `getBrandRules()` is used by `brandRulesCheck.ts` for draft caption warnings (MCP + admin drafts UI).
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export type BrandRules = {
  forbidCompetitorNames: boolean;
  maxQuotedWordsFromSupplier: number;
  allowPriceClaims: boolean;
};

const DEFAULT: BrandRules = {
  forbidCompetitorNames: true,
  maxQuotedWordsFromSupplier: 20,
  allowPriceClaims: false
};

function mergeRules(raw: unknown): BrandRules {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT };
  const o = raw as Record<string, unknown>;
  return {
    forbidCompetitorNames:
      typeof o.forbidCompetitorNames === 'boolean'
        ? o.forbidCompetitorNames
        : DEFAULT.forbidCompetitorNames,
    maxQuotedWordsFromSupplier:
      typeof o.maxQuotedWordsFromSupplier === 'number' &&
      Number.isFinite(o.maxQuotedWordsFromSupplier)
        ? o.maxQuotedWordsFromSupplier
        : DEFAULT.maxQuotedWordsFromSupplier,
    allowPriceClaims:
      typeof o.allowPriceClaims === 'boolean'
        ? o.allowPriceClaims
        : DEFAULT.allowPriceClaims
  };
}

function loadFromDisk(): BrandRules {
  const file = join(process.cwd(), 'config', 'brand-rules.json');
  if (!existsSync(file)) {
    return { ...DEFAULT };
  }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    return mergeRules(raw);
  } catch {
    return { ...DEFAULT };
  }
}

const _rules: BrandRules = loadFromDisk();

export const brandRules: Readonly<BrandRules> = _rules;

export function getBrandRules(): Readonly<BrandRules> {
  return _rules;
}
