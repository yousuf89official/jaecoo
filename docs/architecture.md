# Architecture and reporting contract

## Request path

The browser requests a range-aware JSON endpoint. The serverless API resolves the Asia/Jakarta date and comparison windows, reads Postgres, aggregates account-grain facts, and returns explicit availability and freshness metadata. It never invokes an MCP.

## Ingestion path

The scheduled worker connects to the WAC MCP reporting layer, requests a reporting refresh, pages normalized daily facts, and upserts them into `fact_daily`. A full-history run is deliberately separated from the three-hour serverless cron because it may exceed function time limits.

## Fact contract

The persisted grain is:

`platform + account_id + entity_type + entity_id + report_date + metric + conversion_definition + attribution_window`

Raw and normalized values are both retained. `value_used` follows the required rule:

`normalized_value ?? raw_value`

Freshness (`complete`, `provisional`, or `partial`), currency, timezone, attribution window, conversion definition, source API version, and ingestion time travel with the fact.

## Range contract

- Numeric presets end today and are inclusive.
- MTD begins on the first of the current month; YTD begins January 1.
- Previous period is the immediately preceding equal-length window.
- YoY shifts both boundaries back one calendar year.
- Windows of 62 days or fewer use daily series; longer windows use monthly series.

## Missing-data contract

No aggregation invents rows. If the selected window has no trusted account facts, KPI values are `null`, the source is unavailable, and the UI shows the next operational step. Zero is shown only when a stored fact explicitly has a zero value.
