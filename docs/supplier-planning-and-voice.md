# Supplier signals → content planning (design)

## 1. Summarised view for the AI

The AI can be given a **short monthly (or rolling) summary**, e.g.:

> “Here’s what’s new from Polyflor, Armstrong, etc. this month.”

Sources:

- **`summarize_supplier_updates`** — reads `supplier_updates` for the last *X* days (website / social / **email** rows as they exist).
- Future: grouped by `supplierName` and `tags` (`signal:promotion`, `signal:new-product`, `signal:technical`, …).

Use this as **raw material for ideas only**, not as copy-paste text for posts.

---

## 2. Email + attachment ingestion

**Tool:** `ingest_supplier_email`

| Input | Role |
|--------|------|
| `fromEmail` | Matched to a supplier via **`emailDomains`** in `suppliers.json`. |
| `subject` / `bodyText` | Stored in the update row; used for light **keyword tags** (promo / new product / technical — see `src/supplierEmailHints.ts`). |
| `attachmentNames` | Filenames you’ve already uploaded elsewhere; tagged as `attachment:pdf` / `attachment:image` / `attachment:file`. |

**Logic:**

- If the domain matches a supplier and **`allowEmailContent`** is `true`, a row is written to **`supplier_updates`** with **`source: "email"`**.
- If there is no match or **`allowEmailContent`** is `false`, **no row** is stored (see tool response message).

**Future (not implemented yet):**

- **Promotions:** dates, % discounts, ranges — richer extraction / NLP.
- **New products / SKUs:** named entity or table extraction from body + brochures.
- **Technical / installation:** pull from TDS, MSDS, install guides.
- **Attachments:** one-off **OCR / text extraction** on PDFs and images; merge extracted text into the same tagging pipeline as `bodyText`.

---

## 3. Planner instructions (for the weekly prompt)

When planning posts, the AI should be told something like:

- Use **`summarize_supplier_updates`** (or equivalent) for **recent** `SupplierUpdate` rows — **past X days**.
- **Do not copy full paragraphs** from supplier or manufacturer materials.
- **Rephrase in A to Z’s voice** and keep messaging appropriate for a **local installer**, not the brand’s own national campaign.
- **Disclose positioning clearly:** e.g. that A to Z is a **local installer** of these products, **not** the manufacturer.
- **Credit the manufacturer** when it helps the reader (e.g. product name, range), without implying A to Z *is* the manufacturer.
- Prefer **your own photos / installs** when available.

---

## 4. How it feeds content without copying

The planner can turn signals into **ideas**, for example:

| Signal | Example post idea |
|--------|-------------------|
| “Armstrong launched X with feature Y.” | Local explainer: *What Armstrong’s new X means for busy Redlands families* — benefits in plain language, your install experience. |
| “Polyflor is promoting this range for high-traffic commercial spaces.” | Case-study angle: *Why we recommend Polyflor’s [range] in rentals / busy homes* — generic, local, your photos. |

**Always:**

- **Original wording** in A to Z tone.
- **Manufacturer credit** where appropriate.
- **No** wholesale reuse of supplier brochure copy.
- **User approval** on drafts before anything is passed to **`schedule_post`** or posting tools.

Nothing in this pipeline **auto-posts**; approval stays a human step.
