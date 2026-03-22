# Meta Publisher MCP – Implementation Plan

## Phase 1 – Core Skeleton
- [x] **MCP bootstrap** — `McpServer` + `StdioServerTransport` + `connect` (required for `npm run dev` and MCP clients).
- [x] **`graphPost`** — HTTP status + JSON body handling; throw on Graph `error` object (including HTTP 200 error payloads).
- [x] **Photo helpers** — Page `POST /{page-id}/photos` (`url`, `caption`, optional `published`); Instagram container + `media_publish` per Content Publishing docs.
- [x] **Config** — Graph API version from `META_GRAPH_API_VERSION` (default `v21.0`) in `src/config.ts`; base URL built in `metaClient.ts`.
- [x] **Verify** — `npm run build` succeeds.

## Phase 2 – MCP Tools (Organic)
- [ ] Complete post_facebook_photo and post_instagram_photo tools (if any UX/schema polish beyond Phase 1 registration).
- [ ] Add schedule_post tool and a simple scheduler.
- [ ] Add health_check tool.

## Phase 3 – Marketing API (Paid)
- [ ] Implement createAdSetLocal using Marketing API targeting.
- [ ] Implement createAdFromCreative and flow from organic post -> creative -> ad.
- [ ] Add safety caps for budget and status (PAUSED by default).

## Phase 4 – Integration & Docs
- [ ] Document tool schemas & example calls in README.
- [ ] Add simple CLI or script to test tools without an AI client.
