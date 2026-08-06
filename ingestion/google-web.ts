import { ACCOUNTS } from '../api/_lib/constants.js';
import { getDb } from '../db/client.js';
import { envGateway } from './mcp-client.js';

type Row = Record<string, unknown>;
const GA4_METRICS = ['sessions', 'activeUsers', 'screenPageViews', 'keyEvents'];

function rows(payload: Row): Row[] {
  for (const key of ['rows', 'data', 'results']) {
    const value = payload[key];
    if (Array.isArray(value)) return value as Row[];
    if (value && typeof value === 'object' && Array.isArray((value as Row).rows)) return (value as Row).rows as Row[];
  }
  return [];
}

function numberValue(value: unknown): number | null {
  const parsed = Number(typeof value === 'object' && value ? (value as Row).value : value);
  return value === null || value === undefined || !Number.isFinite(parsed) ? null : parsed;
}

function dimensions(row: Row): string[] {
  const values = row.dimensionValues;
  return Array.isArray(values) ? values.map((value) => String((value as Row).value ?? '')) : [];
}

function metrics(row: Row): number[] {
  const values = row.metricValues;
  return Array.isArray(values) ? values.map((value) => numberValue(value) ?? 0) : [];
}

function firstKey(row: Row): string {
  return Array.isArray(row.keys) ? String(row.keys[0] ?? '') : '';
}

async function upsert(source: 'gsc' | 'ga4', date: string, metric: string, value: number | null, dimensionType = '', dimensionValue = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || value === null) return 0;
  const sql = getDb();
  await sql`
    insert into web_daily(source,account_id,report_date,dimension_type,dimension_value,metric,value,freshness,ingested_at)
    values(${source},${ACCOUNTS[source]},${date},${dimensionType},${dimensionValue},${metric},${value},'complete',now())
    on conflict(source,account_id,report_date,dimension_type,dimension_value,metric)
    do update set value=excluded.value,freshness=excluded.freshness,ingested_at=now()
  `;
  return 1;
}

async function setState(source: 'gsc' | 'ga4', status: string, message: string) {
  const sql = getDb();
  const successful = status === 'connected' || status === 'snapshot_imported';
  await sql`
    insert into source_state(source,status,message,last_success_at,updated_at)
    values(${source},${status},${message},${successful ? new Date().toISOString() : null},now())
    on conflict(source) do update set status=excluded.status,message=excluded.message,
      last_success_at=coalesce(excluded.last_success_at,source_state.last_success_at),updated_at=now()
  `;
}

export interface GoogleWebPayloads {
  gscDaily: Row;
  gscQueries: Row;
  gscPages: Row;
  ga4Daily: Row;
  ga4Channels: Row;
}

export async function importGoogleWebPayloads(
  start: string,
  end: string,
  payloads: GoogleWebPayloads,
  provenance: 'connector_sync' | 'authorized_snapshot' = 'authorized_snapshot',
): Promise<Record<string, number>> {
  const written = { gsc: 0, ga4: 0 };
  for (const row of rows(payloads.gscDaily)) {
    const date = String(row.date ?? firstKey(row));
    for (const metric of ['clicks', 'impressions', 'ctr', 'position']) written.gsc += await upsert('gsc', date, metric, numberValue(row[metric]));
  }
  for (const [dimensionType, payload] of [['query', payloads.gscQueries], ['page', payloads.gscPages]] as const) {
    for (const row of rows(payload)) {
      const label = String(row[dimensionType] ?? firstKey(row));
      for (const metric of ['clicks', 'impressions', 'ctr', 'position']) written.gsc += await upsert('gsc', end, metric, numberValue(row[metric]), dimensionType, label);
    }
  }

  for (const row of rows(payloads.ga4Daily)) {
    const dims = dimensions(row);
    const vals = metrics(row);
    const rawDate = String(row.date ?? dims[0] ?? '');
    const date = /^\d{8}$/.test(rawDate) ? `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6)}` : rawDate;
    for (let index = 0; index < GA4_METRICS.length; index++) {
      const metric = GA4_METRICS[index];
      written.ga4 += await upsert('ga4', date, metric.replace('activeUsers','users').replace('screenPageViews','pageviews').replace('keyEvents','key_events'), vals[index] ?? numberValue(row[metric]));
    }
  }
  for (const row of rows(payloads.ga4Channels)) {
    const label = String(row.sessionDefaultChannelGroup ?? dimensions(row)[0] ?? '');
    const vals = metrics(row);
    written.ga4 += await upsert('ga4', end, 'sessions', vals[0] ?? numberValue(row.sessions), 'channel', label);
    written.ga4 += await upsert('ga4', end, 'users', vals[1] ?? numberValue(row.activeUsers), 'channel', label);
  }

  const snapshot = provenance === 'authorized_snapshot';
  await setState('gsc', snapshot ? 'snapshot_imported' : 'connected', snapshot ? `Authorized Search Console snapshot imported through ${end}; scheduled connector sync is still required.` : `Search Console sync completed through ${end}.`);
  await setState('ga4', snapshot ? 'snapshot_imported' : 'connected', snapshot ? `Authorized GA4 snapshot imported through ${end}; scheduled connector sync is still required.` : `GA4 sync completed through ${end}.`);
  if (snapshot) {
    const sql = getDb();
    for (const source of ['gsc', 'ga4'] as const) {
      await sql`
        insert into ingestion_run(source,account_id,window_start,window_end,status,rows_written,finished_at)
        values(${`google_web_snapshot:${source}`},${ACCOUNTS[source]},${start},${end},'complete',${written[source]},now())
      `;
    }
  }
  return written;
}

export async function syncGoogleWeb(start: string, end: string): Promise<Record<string, number>> {
  const gateway = envGateway('GOOGLE');
  if (!gateway) return {};
  await gateway.connect();
  try {
    const dailyGsc = await gateway.call('gsc_query', { site_url: ACCOUNTS.gsc, start_date: start, end_date: end, dimensions: ['date'], row_limit: 25000 });
    const queryGsc = await gateway.call('gsc_query', { site_url: ACCOUNTS.gsc, start_date: start, end_date: end, dimensions: ['query'], row_limit: 1000 });
    const pageGsc = await gateway.call('gsc_query', { site_url: ACCOUNTS.gsc, start_date: start, end_date: end, dimensions: ['page'], row_limit: 1000 });
    const dailyGa4 = await gateway.call('ga4_run_report', { property_id: ACCOUNTS.ga4, metrics: GA4_METRICS, dimensions: ['date'], start_date: start, end_date: end, limit: 10000 });
    const channels = await gateway.call('ga4_run_report', { property_id: ACCOUNTS.ga4, metrics: ['sessions', 'activeUsers'], dimensions: ['sessionDefaultChannelGroup'], start_date: start, end_date: end, limit: 1000 });
    return importGoogleWebPayloads(start, end, { gscDaily: dailyGsc, gscQueries: queryGsc, gscPages: pageGsc, ga4Daily: dailyGa4, ga4Channels: channels }, 'connector_sync');
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : String(error);
    await setState('gsc', 'sync_error', message);
    await setState('ga4', 'sync_error', message);
    throw error;
  } finally { await gateway.close(); }
}
