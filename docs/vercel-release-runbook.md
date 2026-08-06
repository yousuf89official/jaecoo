# Vercel staged-release and rollback runbook

This runbook applies to the existing `wearecollaborative/jaecoo` project. It is intentionally split into separate authorization gates. A successful build or Preview does not authorize a Production alias change.

## Current live boundary

Read-only inspection on 2026-08-03/04 found:

- Project: `wearecollaborative/jaecoo` (`prj_tl2hpOn6U9SHsnDCi9NOroqJwaAS`)
- Framework setting: Next.js
- Production alias: `https://jaecoo-dashboard.vercel.app`
- Current visible Production deployment: `https://jaecoo-dashboard-1bmbksoeq-wearecollaborative.vercel.app`
- Current application: fixed-period “JAECOO Indonesia — Performance Review”
- Project environment variables: none

Treat that deployment as the rollback target. Do not delete it, remove its alias, or change Production before the separate promotion approval.

## Gate A — explicit Preview authorization

Before any remote mutation, obtain explicit authorization covering:

1. Linking this working folder to the existing project.
2. Changing the project build framework/settings for this Vite application.
3. Provisioning managed Postgres and any billable storage integration.
4. Adding encrypted Preview environment variables.
5. Creating a non-Production Preview deployment.

The authorization for Gate A does **not** include Production promotion.

## Stage 1 — capture the rollback reference

Re-run read-only inspection immediately before the Preview:

```bash
vercel project inspect jaecoo --scope wearecollaborative
vercel ls jaecoo --scope wearecollaborative
```

Record the then-current Production deployment URL and alias in the release log. Stop if they differ from the expected project or if another release is in progress.

## Stage 2 — link and configure Preview only

After Gate A approval:

```bash
vercel link --project jaecoo --scope wearecollaborative
```

Confirm `.vercel/project.json` resolves to the exact project ID above. The repository’s `vercel.json` owns the Vite build, `dist` output, serverless-function duration, SPA rewrite, and three-hour cron declaration.

Configure these encrypted variables for **Preview** first:

- `DATABASE_URL`
- `WAC_MCP_URL`
- `WAC_MCP_ACCESS_TOKEN`
- `WAC_MCP_OWNER_TOKEN`
- `CRON_SECRET`
- `ADMIN_REFRESH_SECRET`
- Optional connector pairs: `META_*`, `TIKTOK_*`, `GOOGLE_*`, `BRAND24_*`
- `JAECOO_ORGANIC_ONBOARDING_JSON` only when the owner plan is approved

Enter secret values through an approved encrypted interface. Do not print them, commit them, paste them into documentation, or store them in shell history. Do not reuse another client’s database or connector grants.

## Stage 3 — provision and prepare managed Postgres

Provision a dedicated managed Postgres database reachable from Vercel. Apply schema and seed from an authorised host with the Preview `DATABASE_URL` injected securely:

```bash
npm run db:migrate
npm run db:seed
```

Verify the exact five Jaecoo platform accounts and the dated six-brand Brand24 seed. Then run the one-time long-running backfill from the authorised host:

```bash
npm run backfill
```

Do not run full history inside the serverless cron. Re-running backfill is safe because facts and dimensions use idempotent upserts.

## Stage 4 — deploy and verify Preview

Create a Preview only:

```bash
vercel deploy --scope wearecollaborative
```

Run the fail-closed verifier against the returned URL:

```bash
JAECOO_VERIFY_URL=https://preview-url.example npm run verify:remote
```

The verifier must prove the correct SPA, JSON APIs, exact paid accounts, populated facts, WAC `page_summary` reconciliation, web sources, six-brand SOV, and recent ingestion evidence.

Vercel ignores Preview deployments when invoking project cron jobs; its scheduler calls the configured path on the Production deployment. On Preview, invoke the protected incremental route once through an approved secret-safe mechanism, then confirm `/api/health` records complete `wac:meta`, `wac:tiktok`, `wac:google`, and `wac_reporting_health` runs. Do not expose `CRON_SECRET` in a shared terminal transcript.

Also verify manually:

- All nine date controls and three comparison modes
- IG/FB/TikTok order: profile → organic → paid
- Organic connection state or verified live grants
- Google spend-units QA warning
- Desktop and mobile layouts
- No browser console errors

## Gate B — explicit Production promotion approval

Present the Preview URL, verifier output, health evidence, current rollback target, and any unavailable sources. Obtain a separate explicit approval to replace the current Production application.

Without Gate B approval, stop with the Preview intact and Production unchanged.

## Stage 5 — staged Production build and promotion

Copy only the verified variables to Production. Re-run migrations and seed against the Production `DATABASE_URL` if Production uses a separate database; otherwise confirm the approved shared database boundary.

An ordinary Preview is not the no-rebuild promotion artifact: Vercel may create a new Production deployment when promoting a Preview. Instead, create a Production-environment build without assigning the Production domains:

```bash
vercel deploy --prod --skip-domain --scope wearecollaborative
```

Manually invoke its protected incremental route and run the fail-closed verifier against the returned staged URL. If it differs from the verified Preview in any material way, stop. Once the staged Production build passes and Gate B approval is still current, promote that exact deployment:

```bash
vercel promote https://staged-production-url.example --scope wearecollaborative
```

Promotion assigns the verified staged deployment to the Production domains without rebuilding it. After the alias changes:

1. Confirm `https://jaecoo-dashboard.vercel.app` resolves to the verified build.
2. Run `npm run verify:remote` against the Production alias.
3. Confirm Vercel has registered the `0 */3 * * *` cron.
4. Wait for or explicitly observe a scheduled run and verify fresh `ingestion_run` evidence.
5. Update the README Production URL only after these checks pass.

## Rollback

Rollback immediately if the Production alias fails the remote verifier, loses DB access, cannot run ingestion, exposes an incorrect client/account, or produces fabricated/mislabelled data.

The captured target must be a deployment that was previously assigned to a Production domain. On Hobby, only the immediately previous Production deployment is eligible; Pro and Enterprise allow any eligible deployment.

Reassign Production to the captured prior deployment:

```bash
vercel rollback https://captured-production-deployment.example --scope wearecollaborative
```

Vercel Instant Rollback does **not** update active cron jobs. Immediately disable the failed release's cron in Project Settings → Cron Jobs, or update it through a separately approved deployment, and verify that no further failed-release ingestion is scheduled. Then verify the old fixed-period application loads at the alias. Do not delete the new database, environment variables, Preview, or failed deployment during the incident; preserve them for diagnosis and keep secrets encrypted.

After a rollback, Vercel disables automatic Production-domain assignment. A later approved release must use `vercel promote` to restore the intended deployment and normal auto-assignment.

After rollback, record:

- Failed deployment URL and time
- First failing acceptance gate
- Production alias restoration time
- Database and cron state
- Required remediation before another Preview
