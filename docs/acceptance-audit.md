# Acceptance audit — 2026-08-03

This audit maps the supplied build brief to authoritative evidence. Local implementation is complete; Production remains a separately gated release because the existing `jaecoo` Vercel project currently serves a different dashboard.

## 1. Range and comparison engine

- API resolution tests cover 7D, 14D, 30D, 60D, 90D, 180D, MTD, YTD, Custom, previous period, YoY, no comparison, Jakarta day boundaries, invalid custom dates, and monthly aggregation beyond 62 days.
- React Query keys include the full range state for every range-aware page.
- Full-runtime browser QA exercised all eight presets and all three comparison modes without an API error.
- Custom opens its date pickers without issuing an incomplete query; the API rejects invalid or future custom ranges.

Status: locally proven.

## 2. Paid reconciliation

- Backfill and incremental ingestion call WAC `reporting_sync`, page account/campaign/ad `performance_report`, and idempotently upsert the full fact contract.
- `normalized_value ?? raw_value` is tested, including an explicit normalized zero.
- Each paid sync compares stored account facts with WAC `page_summary`; the health state becomes `qa_warning` on mismatch.
- Meta, TikTok, and Google account IDs are exact and seeded.

Status: implementation proven; live reconciliation remains unproven until owner credentials, managed Postgres, and the one-off backfill are configured.

## 3. Social structure and onboarding

- In-app browser QA proves Meta and TikTok render profile → organic → paid in that order.
- Instagram, Facebook, and TikTok profile chrome uses persisted profile/media data and honest empty states.
- Facebook renders multiple latest feed cards; all platforms use latest persisted posts for profile chrome and selected-window posts for organic ranking.
- The guarded owner action validates exactly Instagram, Facebook, and TikTok for `jaecoo.id`, requires the admin secret, and verifies `can_read:true` before success.

Status: locally proven; organic data correctly remains not connected.

## 4. Missing data, freshness, and QA

- Empty paid history returns `available:false`, null KPIs, and no campaign/ad rows.
- Organic, paid, GSC, GA4, SOV, and global source state expose source/freshness metadata.
- Google Ads retains raw/normalized values, currency, API version, and the spend-units warning.
- SOV is explicitly a dated rolling 30-day Brand24 popularity index, with all-six and exclude-MG views.

Status: locally proven.

## 5. Idempotence and health

- Database verification upserts the same synthetic fact twice, proves one row remains with the updated value, and removes the synthetic row.
- Every paid and optional ingestion job records `ingestion_run` status and row count.
- The health API exposes local fact freshness plus sanitized Jaecoo-only `account_list`, `reporting_freshness`, `reporting_sync_status`, and schema evidence after a WAC run.

Status: locally proven; scheduled Production runs remain unproven.

## 6. Read-only campaign boundary

- Codebase search finds no campaign create/update/approve/delete, budget, or delivery-status MCP tools.
- Organic registration/grant tools exist only in the separately authenticated onboarding route required by the brief.

Status: proven.

## 7. Vercel release state

Gate A was authorised and executed on 2026-08-04:

- the working folder is linked to exact project `wearecollaborative/jaecoo` (`prj_tl2hpOn6U9SHsnDCi9NOroqJwaAS`);
- the project build settings are Vite, `npm run build`, and `dist`;
- dedicated Neon Free Postgres `jaecoo-preview-db` is provisioned in `sin1` and connected only to Preview;
- migrations, exact source seed, and database idempotence verification pass against that managed database;
- Preview-only `DATABASE_URL`, `WAC_MCP_URL`, `CRON_SECRET`, and `ADMIN_REFRESH_SECRET` are configured without exposing values;
- protected Preview `https://jaecoo-83deoqyb8-wearecollaborative.vercel.app` is `READY`, with a clean function build;
- authenticated probes return HTTP 200 from `/api/health`, `/api/overview`, `/api/meta`, `/api/tiktok`, `/api/google`, `/api/sov`, and `/api/competitors`;
- in-app browser QA exercises every page, all eight presets, all three comparison modes, and a valid Custom window with no load or console errors;
- an authorized WAC `performance_report` snapshot imports 372 exact-scope facts: Meta 24 account + 48 campaign, TikTok 105 account + 100 campaign, Google 65 account + 30 campaign; the current warehouse returns no ad-grain rows;
- imported account totals reconcile exactly to each WAC `page_summary`, while `source_state` explicitly records `snapshot_imported` and states that owner full-history `reporting_sync` remains required;
- authorized exact-scope Google snapshots import 5,856 Search Console facts for `sc-domain:jaecoo.id` and 890 Analytics facts for GA4 property `470554174`, covering 213 GSC daily rows and 216 GA4 daily rows through 2026-08-04;
- the 30-day Google API returns GSC totals of 37,817 clicks and 1,124,030 impressions, plus GA4 totals of 68,718 sessions, 53,634 users, and 138,055 pageviews; in-app browser QA confirms both sections render as `data available` with no console errors;
- GSC and GA4 source state remains explicitly `snapshot_imported`; the snapshot is trusted for the imported scope but is not evidence of recurring connector execution;
- a sanitized Jaecoo-only WAC health snapshot captures all three exact paid-account registrations, three freshness rows, four recent WAC warehouse runs, and the unresolved Google `empty_sync` warning; the health UI explicitly warns that this does not prove the dashboard cron ran;
- `https://jaecoo-dashboard.vercel.app` remains unchanged and still serves the older fixed-period “Performance Review” application.

The Preview still lacks `WAC_MCP_ACCESS_TOKEN` and `WAC_MCP_OWNER_TOKEN`. Accordingly, the imported paid, Google, and health snapshots are usable but are not proof of full history or recurring ingestion; owner sync, ad-grain enrichment, recurring WAC health capture, live web/organic connector sync, scheduled refreshes, and recent successful dashboard-cron evidence remain unavailable. Those credentials must be added through the encrypted Preview interface and the app redeployed before the full backfill and fail-closed data verifier can pass.

Replacing the existing Production application, copying verified variables to Production, registering the Production cron, and promoting the staged build remain Gate B mutations requiring separate explicit approval. A Preview or Ready deployment alone does not satisfy the Production criterion.

Status: Preview runtime proven; credential-backed ingestion and Production not achieved.

The repository includes `npm run verify:remote`, a fail-closed post-deploy gate covering the SPA identity, JSON APIs, exact paid accounts, trusted facts/freshness, web sources, six-brand SOV, WAC reconciliation, fact coverage, and recent cron evidence. Running it against the existing Production URL correctly fails because the old application does not provide the required database API.

The exact Preview, managed-database, backfill, promotion, cron-verification, and rollback sequence is documented in `vercel-release-runbook.md`. Preview authorization and Production promotion remain separate gates.
