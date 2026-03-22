/**
 * Shared types for supplier lists (`suppliers.json`) and ingested signals (`supplier_updates` in SQLite).
 */

export type Supplier = {
  name: string;
  website: string;
  facebookPageUrl: string;
  instagramHandle: string;
  emailDomains: string[];
  allowScrape: boolean;
  allowEmailContent: boolean;
};

/** One row in `supplier_updates` — product/technical signals (and optional `email` from ingest). */
export type SupplierUpdate = {
  id: number;
  supplierName: string;
  dateIso: string;
  source: 'website' | 'facebook' | 'instagram' | 'email';
  /** Canonical URL for the signal (page or post). Use empty string if unknown. */
  url: string;
  title: string;
  summary: string;
  tags: string[];
};
