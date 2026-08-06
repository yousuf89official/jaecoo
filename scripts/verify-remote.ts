import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

type Row = Record<string, unknown>;

const PAID_ACCOUNTS = {
  meta: 'act_1372413011147906',
  tiktok: '7575077837867335696',
  google: '2762824884',
} as const;

function object(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}

function array(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === 'object') : [];
}

function items(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function recent(value: unknown, now: Date, maxAgeHours: number): boolean {
  const timestamp = new Date(text(value)).valueOf();
  return Number.isFinite(timestamp) && now.valueOf() - timestamp >= 0 && now.valueOf() - timestamp <= maxAgeHours * 3_600_000;
}

export function evaluateRemoteSnapshot(input: {
  overview: Row;
  meta: Row;
  tiktok: Row;
  google: Row;
  sov: Row;
  competitors: Row;
  health: Row;
  now?: Date;
  maxRunAgeHours?: number;
  expectOrganic?: boolean;
}) {
  const issues: string[] = [];
  const now = input.now ?? new Date();
  const maxRunAgeHours = input.maxRunAgeHours ?? 6;
  const overviewRange = object(input.overview.range);
  if (overviewRange.timezone !== 'Asia/Jakarta') issues.push('Overview range is not resolved in Asia/Jakarta.');
  if (!object(overviewRange.current).start || !object(overviewRange.current).end) issues.push('Overview range boundaries are missing.');

  const paid = object(input.overview.paid);
  for (const [platform, accountId] of Object.entries(PAID_ACCOUNTS)) {
    const block = object(paid[platform]);
    if (block.accountId !== accountId) issues.push(`${platform} uses the wrong paid account.`);
    if (block.available !== true) issues.push(`${platform} paid facts are unavailable after backfill.`);
    if (!array(block.kpis).some((kpi) => kpi.value !== null && kpi.value !== undefined)) issues.push(`${platform} has no trusted KPI facts.`);
    if (!object(block.freshness).latestReportDate) issues.push(`${platform} paid freshness is missing.`);
  }

  const socialChecks: Array<[string, Row]> = [
    ['Instagram', object(input.meta.instagram)],
    ['Facebook', object(input.meta.facebook)],
    ['TikTok', object(input.tiktok.tiktok)],
  ];
  for (const [label, block] of socialChecks) {
    if (input.expectOrganic && block.connected !== true) issues.push(`${label} organic is not connected.`);
    if (block.connected !== true && items(object(block.connection).steps).length !== 3) issues.push(`${label} missing-data state does not contain the required three onboarding steps.`);
  }

  const googlePaid = object(input.google.paid);
  if (!items(googlePaid.qaFlags).some((flag) => text(flag).includes('spend units'))) issues.push('Google Ads spend-units QA flag is missing.');
  if (!object(input.google.gsc).available) issues.push('Search Console is unavailable.');
  if (!object(input.google.ga4).available) issues.push('GA4 is unavailable.');

  const brands = array(input.sov.brands);
  const expectedBrands = ['Jaecoo', 'Chery', 'BYD', 'Wuling', 'Geely', 'MG'];
  if (!expectedBrands.every((brand) => brands.some((row) => row.brand === brand && row.popularity !== null))) issues.push('The six-brand Brand24 snapshot is incomplete.');
  if (!input.sov.latestSnapshot) issues.push('Brand24 snapshot freshness is missing.');
  if (array(input.competitors.sov).length !== 6) issues.push('Competitor API is not joined to the six-brand SOV snapshot.');

  const states = array(input.health.states);
  for (const platform of Object.keys(PAID_ACCOUNTS)) {
    const state = states.find((row) => row.source === `${platform}_paid`);
    if (!state) {
      issues.push(`${platform} paid source state is missing.`);
      continue;
    }
    const reconciliation = object(object(state.details).reconciliation);
    if (reconciliation.status !== 'reconciled') issues.push(`${platform} does not reconcile to WAC page_summary.`);
  }
  if (!input.health.wacReporting) issues.push('Sanitized WAC reporting freshness/sync evidence is missing.');

  const facts = array(input.health.facts);
  for (const [platform, accountId] of Object.entries(PAID_ACCOUNTS)) {
    if (!facts.some((row) => row.platform === platform && row.account_id === accountId && Number(row.row_count) > 0)) issues.push(`${platform} paid fact coverage is missing from health.`);
  }

  const runs = array(input.health.recentRuns);
  for (const platform of Object.keys(PAID_ACCOUNTS)) {
    const run = runs.find((row) => row.source === `wac:${platform}` && row.status === 'complete');
    if (!run || !recent(run.finished_at, now, maxRunAgeHours)) issues.push(`${platform} has no successful ingestion run within ${maxRunAgeHours} hours.`);
  }
  const healthRun = runs.find((row) => row.source === 'wac_reporting_health' && row.status === 'complete');
  if (!healthRun || !recent(healthRun.finished_at, now, maxRunAgeHours)) issues.push(`WAC reporting-health evidence is older than ${maxRunAgeHours} hours.`);

  return { ok: issues.length === 0, issues };
}

async function fetchText(url: URL): Promise<string> {
  const response = await fetch(url, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${url.pathname} returned HTTP ${response.status}`);
  return await response.text();
}

async function fetchJson(url: URL): Promise<Row> {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${url.pathname} returned HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) throw new Error(`${url.pathname} did not return JSON`);
  return object(await response.json());
}

async function main() {
  const supplied = process.env.JAECOO_VERIFY_URL;
  if (!supplied) throw new Error('JAECOO_VERIFY_URL is required.');
  const origin = new URL(supplied);
  if (!['https:', 'http:'].includes(origin.protocol)) throw new Error('JAECOO_VERIFY_URL must be HTTP(S).');
  origin.pathname = '/'; origin.search = ''; origin.hash = '';
  const api = (path: string) => new URL(path, origin);
  const maxRunAgeHours = Number(process.env.JAECOO_VERIFY_MAX_RUN_AGE_HOURS ?? 6);
  const expectOrganic = process.env.JAECOO_VERIFY_EXPECT_ORGANIC === 'true';

  const [html, overview, meta, tiktok, google, sov, competitors, health] = await Promise.all([
    fetchText(origin),
    fetchJson(api('/api/overview?range=30&cmp=prev')),
    fetchJson(api('/api/meta?range=30&cmp=prev')),
    fetchJson(api('/api/tiktok?range=30&cmp=prev')),
    fetchJson(api('/api/google?range=30&cmp=prev')),
    fetchJson(api('/api/sov?range=30&cmp=prev')),
    fetchJson(api('/api/competitors?range=30&cmp=prev')),
    fetchJson(api('/api/health')),
  ]);
  const result = evaluateRemoteSnapshot({ overview, meta, tiktok, google, sov, competitors, health, maxRunAgeHours, expectOrganic });
  if (!html.includes('JAECOO Marketing Intelligence')) result.issues.unshift('The deployed SPA is not the JAECOO Marketing Intelligence build.');
  result.ok = result.issues.length === 0;
  if (!result.ok) throw new Error(`Remote readiness failed:\n- ${result.issues.join('\n- ')}`);
  console.log(JSON.stringify({ ok: true, origin: origin.origin, checkedAt: new Date().toISOString(), maxRunAgeHours, expectOrganic }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
