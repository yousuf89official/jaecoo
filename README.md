# JAECOO Indonesia Marketing Intelligence

Database-backed marketing reporting for JAECOO Indonesia. A scheduled ingestion process refreshes the WAC reporting warehouse, copies normalized facts into Postgres, and the web dashboard reads only from that database through serverless API routes.

## What is included

- React + TypeScript + Vite dashboard with Overview, Meta, TikTok, Google & Web, Share of Voice, Competitors, Google Trends proxy, and masteradmin Settings.
- 7D, 14D, 30D, 60D, 90D, 180D, MTD, YTD, and custom windows; previous-period, previous-year, or no comparison.
- Instagram, Facebook, and TikTok app-style profile cards, with owner-only authentication and all-available-history import controls in Settings.
- Postgres migrations and the exact Jaecoo platform-account seed.
- One-off WAC full-history backfill and 10-day incremental ingestion with idempotent upserts.
- Account, campaign, and ad-grain breakdowns with WAC `page_summary` reconciliation recorded in source health.
- Read-only serverless API endpoints and protected Vercel Cron route.
- Four-digit client access at `/client/jaecoo`, backed by a rate-limited login, hashed passcode, signed HTTP-only session, and masteradmin enable/disable controls.
- Source-state, ingestion-run, and freshness visibility in Settings.

No browser request calls an MCP. No campaign delivery or budget controls are included.

## Local setup

Requirements: Node 22+, npm, and Postgres 17 (or Docker).

```bash
cp .env.example .env
npm install
docker compose up -d postgres
```

For the Docker database in this repository, set:

```env
DATABASE_URL=postgres://jaecoo:jaecoo_local_only@127.0.0.1:54329/jaecoo
```

Then apply the schema and seed:

```bash
npm run db:migrate
npm run db:seed
```

For a production-like local SPA + database API without linking a Vercel project:

```bash
npm run build
npm run local:full
```

This serves `http://127.0.0.1:4180`. `vercel dev` is also supported. `npm run dev` starts the Vite interface only; when no API/database is available, the interface intentionally shows unavailable states rather than substitute metrics.

To run the full local stack in containers, use `docker compose up --build`; the dashboard is exposed on `http://127.0.0.1:4181` and waits for Postgres health before starting.

## Ingestion

The ingestion runtime needs `WAC_MCP_URL`, `WAC_MCP_OWNER_TOKEN`, `META_MCP_URL`, `TIKTOK_MCP_URL`, and `DATABASE_URL`. The endpoints must be the WAC v3, Meta, and TikTok Streamable HTTP endpoints reachable from the runtime.

One-time full history:

```bash
npm run backfill
```

Incremental 10-day refresh:

```bash
npm run ingest
```

All organic history available through the connected APIs can be imported with:

```bash
npm run sync:organic-history
```

Meta content is cursor-paginated and insights are split into bounded historical windows. TikTok video history is cursor-paginated. Current profile totals are stored as dated snapshots because the platforms do not expose a retroactive daily profile snapshot for every field.

The backfill runs `reporting_sync` with `full_history:true`, then pages account, campaign, and ad entities through `performance_report`. Every fact stores raw and normalized values and computes `value_used = normalized_value ?? raw_value`. Re-running uses the fact grain as the conflict key and updates rows rather than duplicating them.

Each paid sync compares stored account totals with WAC `page_summary` for the identical window. Mismatches become a visible QA warning. The ingestion run also snapshots sanitized `account_list`, `reporting_freshness`, `reporting_sync_status`, and `schema_lookup` evidence for the internal health page.

The serverless cron route accepts Vercel's `Authorization: Bearer $CRON_SECRET` header or `x-cron-secret`. It is scheduled every three hours in `vercel.json` and only refreshes the rolling 10-day window.

## API

All GET routes read Postgres only:

- `/api/overview`
- `/api/meta`
- `/api/tiktok`
- `/api/google`
- `/api/sov`
- `/api/competitors`
- `/api/health`

Range-aware routes accept `range=7|14|30|60|90|180|mtd|ytd|custom`, `cmp=prev|yoy|none`, and `start`/`end` for custom windows.

`POST /api/refresh` requires `Authorization: Bearer $ADMIN_REFRESH_SECRET`. `/api/cron/ingest` requires `CRON_SECRET` and is intended for the scheduled incremental refresh.

## Verification

```bash
npm run check
DATABASE_URL=postgres://jaecoo:jaecoo_local_only@127.0.0.1:54329/jaecoo npm run verify:db
JAECOO_VERIFY_URL=https://your-preview-or-production.example npm run verify:remote
```

The first command runs browser and server TypeScript checks, unit tests for range resolution, auth guards, fact normalization, aggregation, and remote acceptance evaluation, then a production build. The database verifier checks exact source seeds, range-aware SOV, honest empty-source behaviour, and an idempotent fact upsert against Postgres.

The remote verifier fails unless the deployed SPA is this build, all read APIs return JSON, all three paid accounts contain trusted facts and freshness, Google/GA4/GSC and six-brand SOV are present, WAC `page_summary` reconciliations pass, and each scheduled ingestion source has a successful recent run. By default, Jaecoo organic may remain honestly disconnected; set `JAECOO_VERIFY_EXPECT_ORGANIC=true` after onboarding to require all three organic channels.

## Vercel deployment

The required project name is `jaecoo`.

1. Run `vercel link` and select/create the project `jaecoo`.
2. Provision managed Postgres and set `DATABASE_URL` in Preview and Production.
3. Add `WAC_MCP_URL`, `META_MCP_URL`, `TIKTOK_MCP_URL`, `WAC_MCP_ACCESS_TOKEN`, `WAC_MCP_OWNER_TOKEN`, `CRON_SECRET`, `ADMIN_REFRESH_SECRET`, `CLIENT_PASSCODE_PEPPER`, and `CLIENT_SESSION_SECRET`. Never commit values.
4. Run `npm run db:migrate` and `npm run db:seed` against the managed database.
5. Deploy and verify Preview without changing the Production alias.
6. Run `npm run backfill` once from an authorised long-running host against the approved managed `DATABASE_URL`.
7. After separate Production approval, create a staged Production build with `vercel --prod --skip-domain`, verify that exact URL, and promote it with `vercel promote <deployment-url>`.
8. Confirm Vercel Cron is registered and `/api/health` shows successful recent runs.

Production URL: **Not set in the repository until a verified Production deployment succeeds.** A successful build, Preview URL, or Ready status is not treated as Production proof.

Current protected Preview (verified 2026-08-06): **https://jaecoo-oan5ayr17-wearecollaborative.vercel.app**. Its masteradmin Settings route, cost-free reporting pages, and `/client/jaecoo` passcode gate passed in-app browser QA. The Preview database migration includes the new client-access and rate-limit tables. WAC v3, Meta, and TikTok endpoint URLs are configured; sensitive owner/admin token values remain non-exportable from Vercel and must be used through the deployed owner controls.

If the WAC MCP endpoint is not reachable from Vercel, keep scheduled ingestion on an authorised host writing to the same managed Postgres. Do not disable freshness reporting or silently replace missing facts.

## Data policy

- Commercial, vehicle-price, media-spend, and derived cost metrics are excluded from all dashboard pages and client API responses.
- Organic, boosted/support, and performance-paid facts are never blended.
- An empty source response is unavailable, not zero.
- All source date ranges, freshness states, and account IDs remain visible.
- The Brand24 seed is a dated 2026-07-27 rolling 30-day popularity snapshot. It is not total market share.
- Historical cost facts may remain in the private warehouse for source reconciliation, but the dashboard API filters them before any page or client response.

See [docs/build-spec.md](docs/build-spec.md), [docs/organic-onboarding.md](docs/organic-onboarding.md), [docs/architecture.md](docs/architecture.md), the current [acceptance audit](docs/acceptance-audit.md), and the staged [Vercel release runbook](docs/vercel-release-runbook.md).
