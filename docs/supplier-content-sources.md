# Supplier content sources

## How the list is built

1. **Names** come from **`flooring-suppliers.CSV`** (column `Supplier`) — the canonical seed list.
2. Run **`npm run gen:suppliers`** to regenerate **`suppliers.json`** with one entry per unique supplier name (sorted). **Note:** regenerating resets empty template fields; merge in website/socials/emailDomains after regen, or improve the script to preserve them.

## Website and socials

Official **website**, **Facebook**, and **Instagram** are **not** guessed in code. Fill them by:

- **Manual** edits to `suppliers.json`, or  
- **Assisted lookup** (e.g. web search queries such as `<name> flooring Australia website`, `<name> Facebook`, `<name> Instagram`) and paste verified public URLs/handles.

Only use **public** pages you are allowed to reference; respect Terms of Use when any future scraping/listening runs.

## `emailDomains`

Each supplier can list one or more **email domains** (e.g. `polyflor.com.au`, with or without a leading `@`). Incoming **`ingest_supplier_email`** traffic is matched on the **sender’s domain** so updates route to the right **supplier content stream** in reports and (later) storage.

## Kill switches (per supplier)

| Field | Purpose |
|--------|--------|
| **`allowScrape`** | If `false`, skip automated website/social **scanning** for that supplier when implemented. |
| **`allowEmailContent`** | If `false`, do not treat emails from matching domains as ingestible for that supplier’s stream when implemented. |

Defaults are `true`; set either to `false` to opt out without removing the row.

## Update watcher (product / technical)

Similar in spirit to the **competitive insights** watcher, but aimed at **manufacturer content**: new ranges, specs, environmental claims — not retail “who’s cheapest” positioning.

- **Website:** when implemented, prefer key sections (ranges, News / Blog / What’s New / Promotions), extract product names, feature bullets, warranties/ratings — public pages only, throttled, `allowScrape` respected.
- **Social:** when implemented, recent public Facebook / Instagram signals (hooks like “new hybrid”, “colourways”, “bushfire rating”) — APIs or permitted metadata where possible.

Rows are stored in SQLite **`supplier_updates`** with fields aligned to `SupplierUpdate` in `src/supplierTypes.ts` (`supplierName`, `dateIso`, `source`: `website` | `facebook` | `instagram` | `email`, `url`, `title`, `summary`, `tags` JSON).

Implementation entry points: **`src/supplierWatcher.ts`** (`scanSupplierWebsites`, `scanSupplierSocials`); persistence via **`storeSupplierUpdate`** → `insertSupplierUpdate` in `src/db.ts`.

## MCP tools

- **`ingest_supplier_email`** — maps `fromEmail` → supplier via **`emailDomains`**; if **`allowEmailContent`**, writes **`supplier_updates`** (`source: email`) with light keyword tags + attachment hints (`src/supplierEmailHints.ts`). OCR / full NLP: TODO.
- **`summarize_supplier_updates`** — reads **`supplier_updates`** for the lookback window; website/social watcher stubs still return empty until implemented in `supplierWatcher.ts`.

## HTTP drag-and-drop (health server)

When **`npm run dev:health`** (or `start:health`) is running:

- **`GET /supplier-email-upload.html`** — browser UI to drop **`.eml`**, **`.msg`** (best-effort parse), or **`.zip`** (nested `.eml` / `.msg`). Raw files under `data/emails/raw/`, attachments under `data/emails/attachments/`. Text-based **PDF** attachments may have plaintext stored in SQLite **`email_attachments_text`** (no OCR); backfill: `npm run extract:attachments`.
- **`POST /api/upload-email`** — `multipart/form-data` with field **`files`** (repeatable) and optional **`manualTags`** (comma-separated). Raw uploads saved under **`data/emails/raw/`**, attachments under **`data/emails/attachments/`** (under `data/`, gitignored). Parsed with **`mailparser`** (`.eml`) and **`@kenjiuno/msgreader`** (`.msg`, best-effort) in `src/utils/parseEmailFile.ts`, then **`ingestSupplierEmailCore`** (same as MCP). JSON responses **omit full bodies**. Disable with **`UPLOAD_EMAIL_API_ENABLED=false`**.

Planning voice, anti-copying, and approval: **`docs/supplier-planning-and-voice.md`**.

Nothing posts to social media from this module without your explicit approval elsewhere in the workflow.
