# Meta Publisher MCP

Node.js + TypeScript **MCP (Model Context Protocol) server** for **A to Z Flooring Solutions**: connect Meta (Facebook Page + Instagram Business), schedule organic posts, optionally run local-awareness ads, and give an AI assistant **tools** to propose content and publish on approval — not to autopost blindly.

## What we set out to do

**Goal:** Auto‑generate and **schedule** Facebook and Instagram posts for A to Z, with human approval before anything goes live.

- **Brand tiles** — Reusable image assets (the tiles you uploaded) as first-class inputs; captions and scheduling reference public image URLs.
- **Local focus** — Content and competitive awareness centred on **Redlands / Capalaba / Cleveland** (and broader Brisbane area where relevant), including a **competitor insight** track (public signals only, policy-compliant).
- **Voice** — No gimmicky “limited time” hard-sell; **straight‑talking expertise** and practical advice aligned with the business (see the weekly planner prompt).

**Architecture:** Build around a **Meta‑integrated MCP service** so an AI agent can:

1. **Propose** posts (copy, image URL, platform, timing) using your prompts and docs.
2. **Call tools** to **queue** (`schedule_post`) or **publish** (`post_facebook_photo`, `post_instagram_photo`) when you’re ready — scheduling uses SQLite + an in-process worker; nothing is “fire and forget” without your workflow.
3. **Stay relevant** with **insight feeds** (implemented or in progress):
   - **Competitive** — Watch **local competitors’** public websites and socials (stubs + `competitors.json`; full scraping behind flags and policy).
   - **Supplier / manufacturer** — Watch **manufacturers’** public signals, **plus marketing emails** you ingest (MCP `ingest_supplier_email`, optional HTTP upload of `.eml` / `.msg` (best-effort) / zip, `suppliers.json` + `supplier_updates` in SQLite; PDF attachment text may be stored in `email_attachments_text`).

This repo is the **backend + MCP surface** for that vision; the **weekly planner prompt** and **docs** carry brand rules, Instagram formatting, and “don’t copy supplier copy” safeguards.

**Key docs**

| Doc | What it covers |
|-----|----------------|
| `docs/weekly-content-planning-prompt.md` | Brand voice, pillars, scheduling, Instagram notes — paste into your AI weekly. |
| `docs/competitive-insights.md` | Competitor watchlist (`competitors.json`), MCP `generate_competitor_report`, `npm run scrape:competitors` when enabled — **public / policy-compliant** only. |
| `docs/supplier-content-sources.md` | Suppliers (`flooring-suppliers.CSV` → `suppliers.json`), MCP `ingest_supplier_email` / `summarize_supplier_updates`, HTTP `.eml` / `.msg` / zip upload. |
| `docs/supplier-planning-and-voice.md` | Rephrase don’t copy; credit manufacturers; **local installer** positioning; approval before posting. |
| `docs/plan.md` | Roadmap; **post insights** — SQLite `post_insights`, MCP `get_post_insights` (impressions / reach / engagement, optional cache refresh). |

**Quick start**

1. Copy `.env.example` to `.env` and fill in Meta IDs and tokens.
2. Run `npm install`.
3. Run `npm run dev` to start the MCP server in watch mode.
