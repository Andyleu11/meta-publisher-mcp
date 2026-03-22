# Competitive insights module (skeleton)

## Purpose

Ingest **public** competitor marketing signals, analyse patterns, and produce **private** briefs that feed the weekly planner—without naming competitors in published content.

## Safety (AU / legal)

- Public content only; no logins or gated areas; no PII.
- Respect **robots.txt** and site **Terms of Use**; do not crawl sites that forbid it.
- **Throttle** (e.g. once per day per competitor); polite `User-Agent`; no noisy loops.
- Store only high-level signals (offer language, product terms, timestamps, counts).
- **Reporting only** — inspire original A to Z messaging; do not clone copy or auto-repost.

Configure with env such as `SCRAPING_ENABLED=true` only when policy and implementation are approved.

## Files

| File | Role |
|------|------|
| `competitors.json` | Who to monitor (`allowScrape` per row). Optional `region` (`national_retail`, `redlands_cleveland`, `capalaba_bayside`) for report slicing; optional `notes` for business-level address/service metadata only. |
| `src/competitorScraper.ts` | Load config, future daily scrape, `buildStubCompetitorReport()`. |
| `src/tools/competitiveInsightsTools.ts` | MCP tool `generate_competitor_report` (stub JSON for the AI). |

## Weekly flow (target)

1. Optional: `npm run scrape:competitors` refreshes signals (not implemented yet).
2. Planner uses `generate_competitor_report` + human approval before `schedule_post`.

## Future

- `competitor_signals` SQLite table; analysis pass; optional Meta Graph for permitted public Page data.
