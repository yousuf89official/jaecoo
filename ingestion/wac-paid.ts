import { getDb } from '../db/client.js';
import { ACCOUNTS } from '../api/_lib/constants.js';
import { McpGateway } from './mcp-client.js';
import { extractFacts, inferFunnelStage, nextCursor, valueUsed, type WacFact } from './normalize.js';

const METRICS = ['spend', 'impressions', 'clicks', 'landing_page_views', 'conversions', 'conversion_value'];
const ENTITY_TYPES = ['account', 'campaign', 'ad'];
const SAFE_HEALTH_KEYS = new Set([
  'platform','account_id','account_name','currency','timezone',
  'latest_report_date','last_report_date','latest_ingestion','ingested_at','last_ingested_at','latest_freshness','fact_count',
  'status','issue','warning','severity','category','detail','detected_at',
  'window_start','window_end','rows_written','error','started_at','finished_at','completed_at',
]);

function objectRows(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  const record = value as Record<string, unknown>;
  const direct = Object.values(record).find(Array.isArray);
  if (Array.isArray(direct)) return direct.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  for (const nested of Object.values(record)) {
    const found = objectRows(nested);
    if (found.length) return found;
  }
  return [];
}

function safeHealthRows(payload: Record<string, unknown>) {
  const accountIds = new Set<string>(Object.values(ACCOUNTS));
  return objectRows(payload).filter((row) => {
    const accountId = String(row.account_id ?? row.id ?? '');
    return !accountId || accountIds.has(accountId);
  }).map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => SAFE_HEALTH_KEYS.has(key))));
}

function namedRows(value: unknown, key: string): Array<Record<string, unknown>> {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record[key])) {
    return (record[key] as unknown[]).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  }
  for (const nested of Object.values(record)) {
    const found = namedRows(nested, key);
    if (found.length) return found;
  }
  return [];
}

function sanitizeRows(rows: Array<Record<string, unknown>>) {
  return safeHealthRows({ rows });
}

function latestDate(rows: Array<Record<string, unknown>>): string | null {
  return rows.flatMap((row) => [row.latest_report_date, row.last_report_date, row.window_end])
    .map((value) => String(value ?? '').slice(0, 10)).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort().at(-1) ?? null;
}

function numericSummaryValue(value: unknown): number | null {
  const candidate = value && typeof value === 'object'
    ? (value as Record<string, unknown>).normalized_value ?? (value as Record<string, unknown>).value_used ?? (value as Record<string, unknown>).raw_value ?? (value as Record<string, unknown>).value
    : value;
  const parsed = Number(candidate);
  return candidate === null || candidate === undefined || candidate === '' || !Number.isFinite(parsed) ? null : parsed;
}

export function extractPageSummary(payload: Record<string, unknown>): Record<string, number> {
  const summary = payload.page_summary ?? (payload.result as Record<string, unknown> | undefined)?.page_summary;
  const output: Record<string, number> = {};
  if (Array.isArray(summary)) {
    for (const item of summary) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const metric = String(row.metric ?? '');
      const value = numericSummaryValue(row);
      if (METRICS.includes(metric) && value !== null) output[metric] = value;
    }
  } else if (summary && typeof summary === 'object') {
    for (const [metric, item] of Object.entries(summary as Record<string, unknown>)) {
      const value = numericSummaryValue(item);
      if (METRICS.includes(metric) && value !== null) output[metric] = value;
    }
  }
  return output;
}

export async function syncWacReportingHealth(gateway: McpGateway) {
  const [freshness, syncStatus, accounts, schema] = await Promise.all([
    gateway.call('reporting_freshness', {}),
    gateway.call('reporting_sync_status', { limit: 50 }),
    gateway.call('account_list', {}),
    gateway.call('schema_lookup', {}),
  ]);
  const freshnessRows = sanitizeRows(namedRows(freshness, 'accounts').length ? namedRows(freshness, 'accounts') : objectRows(freshness));
  const syncRuns = sanitizeRows(namedRows(syncStatus, 'runs').length ? namedRows(syncStatus, 'runs') : objectRows(syncStatus));
  const issues = sanitizeRows(namedRows(syncStatus, 'unresolved_issues'));
  const accountRows = sanitizeRows(namedRows(accounts, 'accounts').length ? namedRows(accounts, 'accounts') : objectRows(accounts));
  const details = {
    freshness: freshnessRows,
    syncRuns,
    issues,
    accounts: accountRows,
    schemaVersion: String(schema.version ?? schema.schema_version ?? schema.contract_version ?? 'available'),
    provenance: 'connector_sync',
  };
  const latest = latestDate([...freshnessRows, ...syncRuns]);
  const sql = getDb();
  await sql`
    insert into source_state(source,status,message,details,latest_report_date,last_success_at,updated_at)
    values('wac_reporting','connected',${`WAC freshness and sync status captured for ${accountRows.length || 3} Jaecoo paid accounts.`},${sql.json(JSON.parse(JSON.stringify(details)) as never)},${latest},now(),now())
    on conflict(source) do update set status=excluded.status,message=excluded.message,details=excluded.details,
      latest_report_date=excluded.latest_report_date,last_success_at=now(),updated_at=now()
  `;
  return { freshnessRows: freshnessRows.length, syncRuns: syncRuns.length, issues: issues.length, accounts: accountRows.length };
}

export async function importWacReportingHealthSnapshot(input: {
  accounts: Array<Record<string, unknown>>;
  freshness: Array<Record<string, unknown>>;
  syncRuns: Array<Record<string, unknown>>;
  issues: Array<Record<string, unknown>>;
  schemaVersion?: string;
  capturedAt?: string;
}) {
  const accountRows = sanitizeRows(input.accounts);
  const freshnessRows = sanitizeRows(input.freshness);
  const syncRuns = sanitizeRows(input.syncRuns);
  const issues = sanitizeRows(input.issues);
  const details = {
    accounts: accountRows,
    freshness: freshnessRows,
    syncRuns,
    issues,
    schemaVersion: input.schemaVersion ?? 'available',
    provenance: 'authorized_read_only_snapshot',
    capturedAt: input.capturedAt ?? new Date().toISOString(),
  };
  const latest = latestDate([...freshnessRows, ...syncRuns]);
  const rowsWritten = accountRows.length + freshnessRows.length + syncRuns.length + issues.length;
  const sql = getDb();
  await sql.begin(async (transaction) => {
    await transaction`
      insert into source_state(source,status,message,details,latest_report_date,last_success_at,updated_at)
      values('wac_reporting','snapshot_imported',${`Authorized read-only WAC health snapshot captured for ${accountRows.length} Jaecoo paid accounts.`},${transaction.json(JSON.parse(JSON.stringify(details)) as never)},${latest},now(),now())
      on conflict(source) do update set status=excluded.status,message=excluded.message,details=excluded.details,
        latest_report_date=excluded.latest_report_date,last_success_at=now(),updated_at=now()
    `;
    await transaction`
      insert into ingestion_run(source,window_start,window_end,status,rows_written,started_at,finished_at)
      values('wac_health_snapshot',${latest},${latest},'complete',${rowsWritten},now(),now())
    `;
  });
  return { accounts: accountRows.length, freshness: freshnessRows.length, syncRuns: syncRuns.length, issues: issues.length, rowsWritten, latest };
}

export async function upsertFact(fact: WacFact): Promise<void> {
  const sql = getDb();
  await sql`
    insert into fact_daily(
      platform, account_id, entity_type, entity_id, report_date, metric,
      raw_value, normalized_value, value_used, currency, timezone,
      attribution_window, conversion_definition, freshness, source_api_version, ingested_at
    ) values (
      ${fact.platform}, ${fact.account_id}, ${fact.entity_type}, ${fact.entity_id ?? 'account'},
      ${fact.report_date}, ${fact.metric}, ${fact.raw_value ?? null}, ${fact.normalized_value ?? null},
      ${valueUsed(fact)}, ${fact.currency ?? null}, ${fact.timezone ?? 'Asia/Jakarta'},
      ${fact.attribution_window ?? ''}, ${fact.conversion_definition ?? ''},
      ${fact.freshness ?? 'provisional'}, ${fact.source_api_version ?? null},
      ${fact.ingested_at ?? new Date().toISOString()}
    )
    on conflict(platform, account_id, entity_type, entity_id, report_date, metric, conversion_definition, attribution_window)
    do update set raw_value=excluded.raw_value, normalized_value=excluded.normalized_value,
      value_used=excluded.value_used, currency=excluded.currency, timezone=excluded.timezone,
      freshness=excluded.freshness, source_api_version=excluded.source_api_version,
      ingested_at=excluded.ingested_at
  `;
  if (fact.entity_type !== 'account' && fact.entity_id) {
    const name = fact.entity_name ?? fact.name ?? fact.entity_id;
    await sql`
      insert into entity(platform,account_id,entity_type,entity_id,name,campaign_name,objective,funnel_stage)
      values(${fact.platform},${fact.account_id},${fact.entity_type},${fact.entity_id},${name},${fact.campaign_name ?? null},${fact.objective ?? null},${inferFunnelStage(fact.campaign_name ?? name)})
      on conflict(platform,account_id,entity_type,entity_id) do update set
        name=coalesce(nullif(excluded.name,excluded.entity_id),entity.name,excluded.entity_id),
        campaign_name=coalesce(excluded.campaign_name,entity.campaign_name),
        objective=coalesce(excluded.objective,entity.objective),
        funnel_stage=coalesce(excluded.funnel_stage,entity.funnel_stage)
    `;
  }
}

async function pullFacts(gateway: McpGateway, platform: 'meta' | 'tiktok' | 'google', start: string, end: string): Promise<{ written: number; pageSummary: Record<string, number> }> {
  let written = 0;
  let pageSummary: Record<string, number> = {};
  for (const entityType of ENTITY_TYPES) {
    let cursor: string | null = null;
    do {
      const payload = await gateway.call('performance_report', {
        platform, account_id: ACCOUNTS[platform], start_date: start, end_date: end,
        metrics: METRICS, entity_type: entityType, cursor: cursor ?? undefined, limit: 1000,
      });
      const facts = extractFacts(payload);
      if (entityType === 'account' && !Object.keys(pageSummary).length) pageSummary = extractPageSummary(payload);
      for (const fact of facts) { await upsertFact(fact); written += 1; }
      cursor = nextCursor(payload);
    } while (cursor);
  }
  return { written, pageSummary };
}

export async function reconcileAccountSummary(platform: 'meta' | 'tiktok' | 'google', start: string, end: string, pageSummary: Record<string, number>) {
  const sql = getDb();
  const rows = await sql`
    select metric, sum(coalesce(value_used,normalized_value,raw_value))::numeric as value
    from fact_daily where platform=${platform} and account_id=${ACCOUNTS[platform]}
      and entity_type='account' and report_date between ${start} and ${end}
    group by metric
  `;
  const actual = Object.fromEntries(rows.map((row) => [String(row.metric), Number(row.value)]));
  const metrics = Object.keys(pageSummary);
  const checks = metrics.map((metric) => {
    const expected = pageSummary[metric];
    const observed = actual[metric];
    const tolerance = Math.max(0.000001, Math.abs(expected) * 0.0001);
    return { metric, expected, actual: Number.isFinite(observed) ? observed : null, matches: Number.isFinite(observed) && Math.abs(observed - expected) <= tolerance };
  });
  return { status: metrics.length ? (checks.every((check) => check.matches) ? 'reconciled' : 'mismatch') : 'page_summary_unavailable', checks };
}

export async function syncPaidAccount(
  gateway: McpGateway,
  platform: 'meta' | 'tiktok' | 'google',
  options: { start: string; end: string; fullHistory?: boolean },
): Promise<number> {
  const sql = getDb();
  const runRows = await sql`
    insert into ingestion_run(source, account_id, window_start, window_end, status)
    values (${`wac:${platform}`}, ${ACCOUNTS[platform]}, ${options.start}, ${options.end}, 'running') returning id
  `;
  const runId = Number(runRows[0].id);
  try {
    await gateway.call('reporting_sync', {
      platform, account_id: ACCOUNTS[platform],
      ...(options.fullHistory ? { full_history: true } : { start_date: options.start, end_date: options.end }),
    });
    const pulled = await pullFacts(gateway, platform, options.start, options.end);
    const reconciliation = await reconcileAccountSummary(platform, options.start, options.end, pulled.pageSummary);
    await sql`update ingestion_run set status='complete', rows_written=${pulled.written}, finished_at=now() where id=${runId}`;
    await sql`
      insert into source_state(source,status,message,details,last_success_at,updated_at)
      values (${`${platform}_paid`}, ${reconciliation.status === 'mismatch' ? 'qa_warning' : 'connected'}, ${reconciliation.status === 'reconciled' ? 'WAC reporting sync completed and reconciled to page_summary.' : reconciliation.status === 'mismatch' ? 'Stored account facts do not reconcile to WAC page_summary.' : 'WAC reporting sync completed; page_summary was unavailable for reconciliation.'}, ${sql.json({ reconciliation })}, now(), now())
      on conflict(source) do update set status=excluded.status,message=excluded.message,details=excluded.details,last_success_at=excluded.last_success_at,updated_at=now()
    `;
    return pulled.written;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 4000) : String(error);
    await sql`update ingestion_run set status='failed', error=${message}, finished_at=now() where id=${runId}`;
    await sql`
      insert into source_state(source,status,message,updated_at)
      values (${`${platform}_paid`}, 'sync_error', ${`WAC reporting sync failed: ${message.slice(0, 500)}`}, now())
      on conflict(source) do update set status=excluded.status,message=excluded.message,updated_at=now()
    `;
    throw error;
  }
}

export async function refreshOrganicConnectionState(gateway: McpGateway): Promise<Array<Record<string, unknown>>> {
  const payload = await gateway.call('social_channel_list', {});
  const channels = (payload.channels ?? payload.data ?? []) as Array<Record<string, unknown>>;
  for (const platform of ['meta', 'tiktok'] as const) {
    const connected = Array.isArray(channels) && channels.some((channel) => {
      const handle = String(channel.handle ?? '').replace(/^@/, '').toLowerCase();
      const channelPlatform = String(channel.platform ?? '').toLowerCase();
      return handle === 'jaecoo.id' && (platform === 'meta' ? ['instagram', 'facebook', 'meta'].includes(channelPlatform) : channelPlatform === 'tiktok') && channel.can_read === true;
    });
    const sql = getDb();
    await sql`
      insert into source_state(source,status,message,updated_at)
      values (${`${platform}_organic`}, ${connected ? 'connected' : 'not_connected'},
        ${connected ? 'Readable Jaecoo channel found in social_channel_list.' : 'No readable Jaecoo channel is registered in social_channel_list.'}, now())
      on conflict(source) do update set status=excluded.status,message=excluded.message,updated_at=now()
    `;
  }
  return Array.isArray(channels) ? channels : [];
}
