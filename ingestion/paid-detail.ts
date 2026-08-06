import { ACCOUNTS } from '../api/_lib/constants.js';
import { getDb } from '../db/client.js';
import { envGateway, type McpGateway } from './mcp-client.js';
import { inferFunnelStage } from './normalize.js';

type Row = Record<string, unknown>;

function rows(payload: Row): Row[] {
  for (const key of ['data', 'rows', 'list', 'report']) {
    const value = payload[key];
    if (Array.isArray(value)) return value as Row[];
    if (value && typeof value === 'object') {
      const nested = value as Row;
      for (const nestedKey of ['data', 'list', 'rows']) if (Array.isArray(nested[nestedKey])) return nested[nestedKey] as Row[];
    }
  }
  return [];
}

function num(value: unknown): number | null {
  const parsed = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(parsed) ? null : parsed;
}

async function storeReach(platform: 'meta' | 'tiktok', row: Row, entityType: 'account' | 'campaign' | 'ad', reportDate: string) {
  const reach = num(row.reach ?? (row.metrics as Row | undefined)?.reach);
  if (reach === null || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return 0;
  const accountId = ACCOUNTS[platform];
  const entityId = entityType === 'account' ? accountId : entityType === 'ad'
    ? String(row.ad_id ?? row.entity_id ?? row.id ?? '')
    : String(row.campaign_id ?? row.entity_id ?? row.id ?? '');
  if (!entityId) return 0;
  const sql = getDb();
  await sql`
    insert into fact_daily(platform,account_id,entity_type,entity_id,report_date,metric,
      raw_value,normalized_value,value_used,currency,timezone,attribution_window,
      conversion_definition,freshness,source_api_version,ingested_at)
    values(${platform},${accountId},${entityType},${entityId},${reportDate},'reach',
      ${reach},${reach},${reach},'IDR','Asia/Jakarta','','','provisional',${`${platform}_mcp_detail`},now())
    on conflict(platform,account_id,entity_type,entity_id,report_date,metric,conversion_definition,attribution_window)
    do update set raw_value=excluded.raw_value,normalized_value=excluded.normalized_value,
      value_used=excluded.value_used,freshness=excluded.freshness,source_api_version=excluded.source_api_version,ingested_at=now()
  `;
  if (entityType !== 'account') {
    const name = String(entityType === 'ad' ? row.ad_name ?? row.name ?? entityId : row.campaign_name ?? row.name ?? entityId);
    const campaignName = String(row.campaign_name ?? '') || null;
    await sql`
      insert into entity(platform,account_id,entity_type,entity_id,name,campaign_name,objective,funnel_stage)
      values(${platform},${accountId},${entityType},${entityId},${name},${campaignName ?? (entityType === 'campaign' ? name : null)},${String(row.objective ?? '') || null},${inferFunnelStage(campaignName ?? name)})
      on conflict(platform,account_id,entity_type,entity_id) do update set
        name=excluded.name,campaign_name=excluded.campaign_name,objective=coalesce(excluded.objective,entity.objective),
        funnel_stage=coalesce(excluded.funnel_stage,entity.funnel_stage)
    `;
  }
  return 1;
}

function dateOf(row: Row, fallback: string): string {
  const value = row.report_date ?? row.date_start ?? row.stat_time_day ?? row.date ?? (row.dimensions as Row | undefined)?.stat_time_day;
  return String(value ?? fallback).slice(0, 10);
}

function monthWindows(start: string, end: string): Array<{ start: string; end: string }> {
  const windows: Array<{ start: string; end: string }> = [];
  let cursor = new Date(`${start}T00:00:00Z`);
  const final = new Date(`${end}T00:00:00Z`);
  while (cursor <= final) {
    const windowStart = cursor.toISOString().slice(0, 10);
    const windowEndDate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    if (windowEndDate > final) windowEndDate.setTime(final.valueOf());
    windows.push({ start: windowStart, end: windowEndDate.toISOString().slice(0, 10) });
    cursor = new Date(windowEndDate); cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return windows;
}

async function syncMeta(gateway: McpGateway, start: string, end: string) {
  let written = 0;
  for (const level of ['account', 'campaign', 'ad'] as const) {
    const payload = await gateway.call('meta_get_insights', {
      ad_account_id: ACCOUNTS.meta, level,
      fields: level === 'account' ? ['reach', 'date_start'] : level === 'campaign'
        ? ['campaign_id', 'campaign_name', 'objective', 'reach', 'date_start']
        : ['ad_id', 'ad_name', 'campaign_id', 'campaign_name', 'objective', 'reach', 'date_start'],
      time_start: start, time_end: end, time_increment: 1, limit: 1000,
    });
    for (const row of rows(payload)) written += await storeReach('meta', row, level, dateOf(row, end));
  }
  return written;
}

async function syncTikTok(gateway: McpGateway, start: string, end: string) {
  let written = 0;
  for (const window of monthWindows(start, end)) {
    for (const level of ['account', 'campaign', 'ad'] as const) {
      const payload = await gateway.call('tiktok_get_report', {
        advertiser_id: ACCOUNTS.tiktok,
        data_level: level === 'account' ? 'AUCTION_ADVERTISER' : level === 'campaign' ? 'AUCTION_CAMPAIGN' : 'AUCTION_AD',
        dimensions: level === 'account' ? ['stat_time_day'] : level === 'campaign' ? ['campaign_id', 'stat_time_day'] : ['ad_id', 'stat_time_day'],
        metrics: level === 'account' ? ['reach'] : level === 'campaign' ? ['campaign_name', 'reach'] : ['ad_name', 'campaign_name', 'reach'],
        start_date: window.start, end_date: window.end,
      });
      for (const row of rows(payload)) written += await storeReach('tiktok', row, level, dateOf(row, window.end));
    }
  }
  return written;
}

export async function syncPaidDetail(start: string, end: string) {
  const result: Record<string, number> = {};
  const meta = envGateway('META');
  if (meta) {
    await meta.connect();
    try { result.meta = await syncMeta(meta, start, end); }
    finally { await meta.close(); }
  }
  const tiktok = envGateway('TIKTOK');
  if (tiktok) {
    await tiktok.connect();
    try { result.tiktok = await syncTikTok(tiktok, start, end); }
    finally { await tiktok.close(); }
  }
  return result;
}
