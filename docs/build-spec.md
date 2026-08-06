# JAECOO dynamic dashboard build specification

This repository implements the supplied `CODEX_PROMPT_Jaecoo_Dynamic_Dashboard.md`. This checked-in contract captures the operational requirements that must remain true as the dashboard evolves.

## Objectives

1. Browser requests read a database-backed JSON API and never invoke an MCP.
2. Scheduled ingestion refreshes WAC reporting and copies daily facts into Postgres.
3. All pages support 7D, 14D, 30D, 60D, 90D, 180D, MTD, YTD, and custom date windows with previous-period, previous-year, or no comparison.
4. Instagram, Facebook, and TikTok preserve this order: profile mockup, organic metrics, paid metrics.
5. Missing or ungranted data remains unavailable and is never represented by invented values or inferred zeroes.

## Authoritative assets

| Source | Asset |
| --- | --- |
| GA4 | `470554174` (`JAECOO.ID`) |
| Search Console | `sc-domain:jaecoo.id` |
| Google Ads | customer `2762824884`; MCC `4960742572` |
| Meta Ads | `act_1372413011147906` |
| TikTok Ads | `7575077837867335696` |
| Brand24 | Jaecoo, Chery, BYD, Wuling, Geely, MG comparison set |

All paid currency is IDR and all reporting windows use Asia/Jakarta.

## Required fact semantics

Paid facts preserve platform, account, entity grain, date, metric, raw and normalized values, currency, timezone, attribution, conversion definition, freshness, source API version, and ingestion timestamp. `value_used` must always follow `normalized_value ?? raw_value`.

An incremental run refreshes the last ten days so provisional values can mature. A full-history backfill is separately runnable from an authorised long-running host. Both are idempotent.

## Source-specific boundaries

- WAC `performance_report` is primary for Meta, TikTok, and Google paid facts.
- TikTok reach/video-view objectives must not be judged primarily by clicks.
- Google Ads spend keeps a visible units QA warning until reconciled.
- Search Console, GA4, organic social, and paid facts stay in separate blocks.
- Brand24 popularity is a rolling 30-day index and must not be described as total-market SOV.
- MG affects the Brand24 denominator enough to require all-six and exclude-MG views.
- Google Trends is not connected; Search Console branded impressions are labelled as a proxy.

## Organic connection state

Jaecoo organic IG/FB/TikTok was not readable when the brief was supplied. The dashboard must keep the profile chrome empty and show the exact owner onboarding path until `social_channel_list` returns the Jaecoo handle with `can_read:true`. See `organic-onboarding.md`.

## Runtime and deployment

- React + TypeScript + Vite frontend.
- Root `/api` serverless functions with no request-time MCP calls.
- Postgres schema under `/db`.
- WAC ingestion under `/ingestion`.
- Vercel project name must be exactly `jaecoo`.
- Incremental cron runs every three hours and requires `CRON_SECRET`.
- Production requires managed `DATABASE_URL`, successful migrations/seed, a one-off full backfill, and a verified firing cron.
- Preview readiness is not Production proof.

## Completion gates

- Every date/comparison control re-queries the database API.
- Paid metrics reconcile to WAC page summaries for the identical window.
- Social page order and honest connection state are visually verified.
- Empty history remains unavailable; explicit stored zeroes remain zero.
- Re-running ingestion does not duplicate facts.
- No campaign-write or delivery-control MCP is referenced.
- Production is reachable from the `jaecoo` Vercel project against managed Postgres and the health view proves fresh ingestion.
