import 'dotenv/config';
import { closeDb, getDb } from '../db/client.js';
import { McpGateway } from './mcp-client.js';
import { refreshOrganicConnectionState, syncPaidAccount, syncWacReportingHealth } from './wac-paid.js';
import { syncOrganicChannels } from './organic.js';
import { syncGoogleWeb } from './google-web.js';
import { syncBrand24 } from './brand24.js';
import { syncPaidDetail } from './paid-detail.js';

function date(value: Date) { return value.toISOString().slice(0, 10); }

type JobResult<T> = { status: 'complete'; result: T } | { status: 'failed'; error: string };

function rowsWritten(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object') return 0;
  return Object.values(value as Record<string, unknown>).reduce<number>((sum, item) => sum + rowsWritten(item), 0);
}

async function optionalJob<T>(job: () => Promise<T>): Promise<JobResult<T>> {
  try { return { status: 'complete', result: await job() }; }
  catch (error) { return { status: 'failed', error: error instanceof Error ? error.message : String(error) }; }
}

async function loggedOptionalJob<T>(source: string, start: string, end: string, job: () => Promise<T>): Promise<JobResult<T>> {
  const sql = getDb();
  const created = await sql`
    insert into ingestion_run(source,window_start,window_end,status)
    values(${source},${start},${end},'running') returning id
  `;
  const runId = Number(created[0].id);
  const result = await optionalJob(job);
  if (result.status === 'complete') {
    await sql`update ingestion_run set status='complete',rows_written=${rowsWritten(result.result)},finished_at=now() where id=${runId}`;
  } else {
    await sql`update ingestion_run set status='failed',error=${result.error.slice(0,4000)},finished_at=now() where id=${runId}`;
  }
  return result;
}

export async function runIngestion(options: { fullHistory?: boolean; days?: number } = {}) {
  const url = process.env.WAC_MCP_URL;
  if (!url) throw new Error('WAC_MCP_URL is not configured');
  const token = options.fullHistory ? process.env.WAC_MCP_OWNER_TOKEN : (process.env.WAC_MCP_OWNER_TOKEN ?? process.env.WAC_MCP_ACCESS_TOKEN);
  if (!token) throw new Error('WAC MCP token is not configured');

  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - ((options.days ?? 10) - 1));
  const startDate = options.fullHistory ? '2025-01-01' : date(start);
  const endDate = date(end);
  const gateway = new McpGateway(url, token);
  await gateway.connect();
  try {
    const results: Record<string, unknown> = {};
    for (const platform of ['meta', 'tiktok', 'google'] as const) {
      results[platform] = await optionalJob(() => syncPaidAccount(gateway, platform, { start: startDate, end: endDate, fullHistory: options.fullHistory }));
    }
    const optional: Record<string, unknown> = {};
    optional.wacReportingHealth = await loggedOptionalJob('wac_reporting_health', startDate, endDate, () => syncWacReportingHealth(gateway));
    const discovery = await loggedOptionalJob('organic_discovery', startDate, endDate, () => refreshOrganicConnectionState(gateway));
    optional.organicDiscovery = discovery;
    const channels = discovery.status === 'complete' ? discovery.result : [];
    optional.organic = await loggedOptionalJob('organic_profiles_posts', startDate, endDate, () => syncOrganicChannels(channels, startDate, endDate));
    optional.paidDetail = await loggedOptionalJob('platform_paid_detail', startDate, endDate, () => syncPaidDetail(startDate, endDate));
    optional.googleWeb = await loggedOptionalJob('google_web', startDate, endDate, () => syncGoogleWeb(startDate, endDate));
    optional.brand24 = await loggedOptionalJob('brand24', endDate, endDate, () => syncBrand24(endDate));
    return { start: startDate, end: endDate, fullHistory: Boolean(options.fullHistory), rowsWritten: results, optional };
  } finally {
    await gateway.close();
  }
}

export async function closeIngestionResources() { await closeDb(); }
