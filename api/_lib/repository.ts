import { getDb } from '../../db/client.js';
import type { DateWindow, ResolvedRange } from './date-range.js';
import { ACCOUNTS, ORGANIC_ONBOARDING_STEPS } from './constants.js';

type MetricRow = {
  report_date: string | Date;
  metric: string;
  value_used: string | number | null;
  raw_value: string | number | null;
  normalized_value: string | number | null;
  currency: string | null;
  freshness: string;
  ingested_at: string | Date;
};

const n = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const dateKey = (value: string | Date) => typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
const monthKey = (value: string) => value.slice(0, 7);

function totals(rows: MetricRow[]) {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const value = n(row.value_used) ?? n(row.normalized_value) ?? n(row.raw_value);
    if (value !== null) out[row.metric] = (out[row.metric] ?? 0) + value;
  }
  return out;
}

function derived(values: Record<string, number>): Record<string, number | undefined> {
  return {
    ...values,
    ctr: values.impressions ? (values.clicks ?? 0) / values.impressions : undefined,
  };
}

const COST_METRICS = new Set(['spend', 'cpm', 'cpc', 'cpa', 'cpv', 'cost', 'cost_per_conversion', 'conversion_value', 'roas']);

function delta(current: number | undefined, comparison: number | undefined): number | null {
  if (current === undefined || comparison === undefined || comparison === 0) return null;
  return (current - comparison) / comparison;
}

type OrganicRow = { report_date: string | Date; metric: string; value: unknown; freshness?: string };

type SocialPostRow = Record<string, unknown> & { posted_at?: string | Date };

function augmentOrganicWithPosts(base: Record<string, number>, posts: SocialPostRow[]) {
  const out = { ...base };
  let engagement = 0;
  let reach = 0;
  let impressions = 0;
  let views = 0;
  for (const post of posts) {
    engagement += n(post.engagement) ?? [post.likes, post.comments, post.shares, post.saves].reduce<number>((sum, value) => sum + (n(value) ?? 0), 0);
    reach += n(post.reach) ?? 0;
    impressions += n(post.impressions) ?? 0;
    views += n(post.views) ?? 0;
  }
  if (engagement || posts.length) out.engagement = engagement;
  if (out.reach === undefined && reach) out.reach = reach;
  if (out.impressions === undefined && impressions) out.impressions = impressions;
  if (out.views === undefined && views) out.views = views;
  const denominator = out.reach ?? out.impressions ?? out.views;
  if (denominator) out.engagement_rate = engagement / denominator;
  return out;
}

export function aggregateOrganic(rows: OrganicRow[]): Record<string, number> {
  const byMetric = new Map<string, Array<{ date: string; value: number }>>();
  for (const row of rows) {
    const value = n(row.value);
    if (value === null) continue;
    const metric = String(row.metric);
    const points = byMetric.get(metric) ?? [];
    points.push({ date: dateKey(row.report_date), value });
    byMetric.set(metric, points);
  }
  const out: Record<string, number> = {};
  for (const [metric, points] of byMetric) {
    points.sort((a, b) => a.date.localeCompare(b.date));
    const canonical = metric === 'page_impressions_unique' ? 'reach'
      : metric === 'page_views_total' ? 'profile_views'
        : metric === 'page_impressions' ? 'impressions' : metric;
    if (['follower_count', 'page_follows', 'followers'].includes(metric)) {
      if (points.length > 1) out.followers_growth = points.at(-1)!.value - points[0].value;
      continue;
    }
    if (canonical.includes('rate')) out[canonical] = points.reduce((sum, point) => sum + point.value, 0) / points.length;
    else out[canonical] = (out[canonical] ?? 0) + points.reduce((sum, point) => sum + point.value, 0);
  }
  return out;
}

function mapDeltas(current: Record<string, number>, comparison: Record<string, number> | null) {
  const keys = new Set([...Object.keys(current), ...Object.keys(comparison ?? {})]);
  return Object.fromEntries([...keys].map((key) => [key, delta(current[key], comparison?.[key])]));
}

async function paidRows(platform: keyof typeof ACCOUNTS, window: DateWindow, entityType = 'account') {
  const sql = getDb();
  return await sql<MetricRow[]>`
    select report_date, metric, raw_value, normalized_value,
      coalesce(value_used, normalized_value, raw_value) as value_used,
      currency, freshness, ingested_at
    from fact_daily
    where platform=${platform} and account_id=${ACCOUNTS[platform]}
      and entity_type=${entityType} and report_date between ${window.start} and ${window.end}
    order by report_date asc
  `;
}

export async function getPaidBlock(platform: 'meta' | 'tiktok' | 'google', range: ResolvedRange) {
  const currentRows = await paidRows(platform, range.current);
  const comparisonRows = range.comparison ? await paidRows(platform, range.comparison) : [];
  const current = derived(totals(currentRows));
  const comparison = range.comparison ? derived(totals(comparisonRows)) : null;
  const metrics = ['impressions', 'reach', 'clicks', 'ctr', 'conversions'] as const;

  const buckets = new Map<string, Record<string, number>>();
  for (const row of currentRows) {
    const date = dateKey(row.report_date);
    const bucket = range.granularity === 'month' ? monthKey(date) : date;
    const value = n(row.value_used) ?? n(row.normalized_value) ?? n(row.raw_value);
    if (value === null) continue;
    const item = buckets.get(bucket) ?? {};
    item[row.metric] = (item[row.metric] ?? 0) + value;
    buckets.set(bucket, item);
  }

  const sql = getDb();
  const sourceStateRows = await sql`select status,message from source_state where source=${`${platform}_paid`} limit 1`;
  const sourceState = sourceStateRows[0];
  async function entityBreakdown(entityType: 'campaign' | 'ad') {
    const rows = await sql`
    select f.entity_id, coalesce(e.name, e.campaign_name, f.entity_id) as name,
      e.campaign_name, e.objective, e.funnel_stage, f.metric,
      sum(coalesce(f.value_used, f.normalized_value, f.raw_value)) as value
    from fact_daily f
    left join entity e on e.platform=f.platform and e.account_id=f.account_id
      and e.entity_type=f.entity_type and e.entity_id=f.entity_id
    where f.platform=${platform} and f.account_id=${ACCOUNTS[platform]}
      and f.entity_type=${entityType} and f.report_date between ${range.current.start} and ${range.current.end}
      and f.metric not in ('spend','cpm','cpc','cpa','cpv','cost','cost_per_conversion','conversion_value','roas')
    group by f.entity_id, e.name, e.campaign_name, e.objective, e.funnel_stage, f.metric
    order by sum(case when f.metric='impressions' then coalesce(f.value_used,f.normalized_value,f.raw_value) else 0 end) desc
    limit 60
  `;
    const entityMap = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
    const id = String(row.entity_id);
      const item: Record<string, unknown> = entityMap.get(id) ?? {
        id, name: row.name, campaignName: row.campaign_name,
        objective: row.objective, funnelStage: row.funnel_stage,
    };
    item[String(row.metric)] = n(row.value);
      entityMap.set(id, item);
    }
    return [...entityMap.values()].slice(0, 12).map((item) => Object.fromEntries(Object.entries(item).filter(([key]) => !COST_METRICS.has(key))));
  }
  const [campaigns, ads] = await Promise.all([entityBreakdown('campaign'), entityBreakdown('ad')]);

  const latest = currentRows.length ? currentRows.reduce((a, b) => dateKey(a.report_date) > dateKey(b.report_date) ? a : b) : null;
  const freshSet = [...new Set(currentRows.map((row) => row.freshness))];
  return {
    source: 'WAC reporting warehouse', accountId: ACCOUNTS[platform],
    available: currentRows.length > 0,
    freshness: latest ? { latestReportDate: dateKey(latest.report_date), states: freshSet, ingestedAt: latest.ingested_at } : null,
    qaFlags: sourceState?.status === 'qa_warning'
      ? [String(sourceState.message ?? 'WAC page-summary reconciliation requires review.').replace(/spend[- ]units?/gi, 'reporting units')]
      : [],
    kpis: metrics.map((metric) => ({
      metric, value: current[metric] ?? null,
      comparison: comparison?.[metric] ?? null,
      delta: delta(current[metric], comparison?.[metric]),
    })),
    series: [...buckets].map(([date, values]) => ({
      date,
      ...Object.fromEntries(Object.entries(derived(values)).filter(([key]) => !COST_METRICS.has(key))),
    })),
    campaigns, ads,
  };
}

export async function getSocialBlock(platform: 'instagram' | 'facebook' | 'tiktok', range: ResolvedRange) {
  const sql = getDb();
  const profileRows = await sql`
    select * from social_profile where platform=${platform}
    order by snapshot_date desc limit 1
  `;
  const profile = profileRows[0] ?? null;
  const channelKey = profile?.channel_key as string | undefined;
  const posts = channelKey ? await sql`
    select * from social_post where platform=${platform} and channel_key=${channelKey}
    order by posted_at desc limit 12
  ` : [];
  const rangePosts = channelKey ? await sql`
    select * from social_post where platform=${platform} and channel_key=${channelKey}
      and posted_at::date between ${range.current.start} and ${range.current.end}
    order by posted_at desc
  ` : [];
  const comparisonPosts = channelKey && range.comparison ? await sql`
    select * from social_post where platform=${platform} and channel_key=${channelKey}
      and posted_at::date between ${range.comparison.start} and ${range.comparison.end}
    order by posted_at desc
  ` : [];
  const organic = channelKey ? await sql`
    select report_date, metric, value, freshness, ingested_at from organic_daily
    where platform=${platform} and channel_key=${channelKey}
      and report_date between ${range.current.start} and ${range.current.end}
    order by report_date
  ` : [];
  const comparisonOrganic = channelKey && range.comparison ? await sql`
    select report_date, metric, value, freshness, ingested_at from organic_daily
    where platform=${platform} and channel_key=${channelKey}
      and report_date between ${range.comparison.start} and ${range.comparison.end}
    order by report_date
  ` : [];
  const organicTotals = augmentOrganicWithPosts(aggregateOrganic(organic as OrganicRow[]), rangePosts as SocialPostRow[]);
  const comparisonTotals = range.comparison ? augmentOrganicWithPosts(aggregateOrganic(comparisonOrganic as OrganicRow[]), comparisonPosts as SocialPostRow[]) : null;
  const latestOrganic = organic.length ? organic.reduce((latest, row) => dateKey(row.report_date as string | Date) > dateKey(latest.report_date as string | Date) ? row : latest) : null;
  const freshnessStates = [...new Set((organic as Array<Record<string, unknown>>).map((row) => String(row.freshness ?? 'complete')))];
  return {
    connected: Boolean(profile), profile, posts,
    connection: profile ? null : {
      title: 'Connection required',
      message: `Jaecoo ${platform} is not registered with a readable WAC social-channel grant.`,
      steps: ORGANIC_ONBOARDING_STEPS,
    },
    organic: {
      available: organic.length > 0,
      source: platform === 'tiktok' ? 'TikTok organic channel connector' : 'Meta organic channel connector',
      freshness: latestOrganic ? {
        latestReportDate: dateKey(latestOrganic.report_date as string | Date),
        states: freshnessStates,
        ingestedAt: latestOrganic.ingested_at ? String(latestOrganic.ingested_at) : null,
      } : null,
      totals: organicTotals,
      comparisonTotals,
      deltas: mapDeltas(organicTotals, comparisonTotals),
      series: organic.map((row) => ({ date: dateKey(row.report_date as string | Date), metric: row.metric, value: n(row.value) })),
      topPosts: [...rangePosts].sort((a, b) => Number(b.engagement ?? 0) - Number(a.engagement ?? 0)).slice(0, 8),
    },
  };
}

export function aggregateWeb(rows: Array<Record<string, unknown>>, source: 'gsc' | 'ga4', granularity: 'day' | 'month') {
  const baseRows = rows.filter((row) => !row.dimension_type);
  const dailyMap = new Map<string, Record<string, number>>();
  for (const row of baseRows) {
    const value = n(row.value);
    if (value === null) continue;
    const date = dateKey(row.report_date as string | Date);
    const item = dailyMap.get(date) ?? {};
    item[String(row.metric)] = value;
    dailyMap.set(date, item);
  }
  const totalsMap: Record<string, number> = {};
  let positionWeighted = 0;
  for (const day of dailyMap.values()) {
    for (const [metric, value] of Object.entries(day)) {
      if (!['ctr', 'position'].includes(metric)) totalsMap[metric] = (totalsMap[metric] ?? 0) + value;
    }
    if (day.position !== undefined && day.impressions) positionWeighted += day.position * day.impressions;
  }
  if (source === 'gsc') {
    if (totalsMap.impressions) {
      totalsMap.ctr = (totalsMap.clicks ?? 0) / totalsMap.impressions;
      if (positionWeighted) totalsMap.position = positionWeighted / totalsMap.impressions;
    }
  }
  const seriesMap = new Map<string, Record<string, number | string>>();
  const bucketPosition = new Map<string, number>();
  for (const [fullDate, day] of dailyMap) {
    const key = granularity === 'month' ? monthKey(fullDate) : fullDate;
    const item = seriesMap.get(key) ?? { date: key };
    for (const [metric, value] of Object.entries(day)) {
      if (!['ctr', 'position'].includes(metric)) item[metric] = Number(item[metric] ?? 0) + value;
    }
    if (day.position !== undefined && day.impressions) bucketPosition.set(key, (bucketPosition.get(key) ?? 0) + day.position * day.impressions);
    seriesMap.set(key, item);
  }
  for (const [key, item] of seriesMap) {
    const impressions = Number(item.impressions ?? 0);
    if (source === 'gsc' && impressions) {
      item.ctr = Number(item.clicks ?? 0) / impressions;
      const weighted = bucketPosition.get(key);
      if (weighted) item.position = weighted / impressions;
    }
  }
  const breakdown = rows.filter((row) => row.dimension_type).map((row) => ({
    type: row.dimension_type, label: row.dimension_value, metric: row.metric, value: n(row.value),
  }));
  return { totals: totalsMap, series: [...seriesMap.values()], breakdown };
}

export async function getWebBlock(source: 'gsc' | 'ga4', range: ResolvedRange) {
  const sql = getDb();
  const accountId = ACCOUNTS[source];
  const rows = await sql`
    select report_date, dimension_type, dimension_value, metric, value, freshness, ingested_at
    from web_daily where source=${source} and account_id=${accountId}
      and report_date between ${range.current.start} and ${range.current.end}
    order by report_date
  `;
  const comparisonRows = range.comparison ? await sql`
    select report_date, dimension_type, dimension_value, metric, value, freshness, ingested_at
    from web_daily where source=${source} and account_id=${accountId}
      and report_date between ${range.comparison.start} and ${range.comparison.end}
    order by report_date
  ` : [];
  const current = aggregateWeb(rows, source, range.granularity);
  const comparison = range.comparison ? aggregateWeb(comparisonRows, source, range.granularity) : null;
  const latestRow = rows.length ? rows.reduce((latest, row) => dateKey(row.report_date as string | Date) > dateKey(latest.report_date as string | Date) ? row : latest) : null;
  return {
    source: source === 'gsc' ? 'Google Search Console' : 'Google Analytics 4',
    accountId, available: rows.length > 0, totals: current.totals,
    freshness: latestRow ? {
      latestReportDate: dateKey(latestRow.report_date as string | Date),
      states: [...new Set(rows.map((row) => String(row.freshness ?? 'complete')))],
      ingestedAt: latestRow.ingested_at ? String(latestRow.ingested_at) : null,
    } : null,
    comparisonTotals: comparison?.totals ?? null,
    deltas: mapDeltas(current.totals, comparison?.totals ?? null),
    series: current.series, breakdown: current.breakdown,
  };
}

export async function getSovBlock(range: ResolvedRange) {
  const sql = getDb();
  const latestRows = await sql`select max(snapshot_date) as latest from sov_snapshot where geo='ID' and snapshot_date <= ${range.current.end}`;
  const latest = latestRows[0]?.latest ? dateKey(latestRows[0].latest as string | Date) : null;
  const rows = latest ? await sql`
    select snapshot_date, brand, popularity, mentions, geo, source
    from sov_snapshot where snapshot_date=${latest} and geo='ID'
      and brand in ('Jaecoo','Chery','BYD','Wuling','Geely','MG') order by popularity desc
  ` : [];
  const mentions = latest ? await sql`
    select brand, mentions from sov_snapshot where snapshot_date=${latest} and geo='ID'
      and brand in ('Jaecoo','Geely','MG','Honda') and mentions is not null order by mentions desc
  ` : [];
  const comparisonLatestRows = range.comparison ? await sql`
    select max(snapshot_date) as latest from sov_snapshot where geo='ID' and snapshot_date <= ${range.comparison.end}
  ` : [];
  const comparisonLatest = comparisonLatestRows[0]?.latest ? dateKey(comparisonLatestRows[0].latest as string | Date) : null;
  const comparisonRows = comparisonLatest ? await sql`
    select brand, popularity from sov_snapshot where snapshot_date=${comparisonLatest} and geo='ID'
      and brand in ('Jaecoo','Chery','BYD','Wuling','Geely','MG')
  ` : [];
  const trend = await sql`
    select snapshot_date, brand, popularity from sov_snapshot where geo='ID'
      and snapshot_date between ${range.current.start} and ${range.current.end}
    order by snapshot_date
  `;
  const total = rows.reduce((sum, row) => sum + Number(row.popularity ?? 0), 0);
  const totalExMg = rows.filter((row) => row.brand !== 'MG').reduce((sum, row) => sum + Number(row.popularity ?? 0), 0);
  const comparisonTotal = comparisonRows.reduce((sum, row) => sum + Number(row.popularity ?? 0), 0);
  const comparisonTotalExMg = comparisonRows.filter((row) => row.brand !== 'MG').reduce((sum, row) => sum + Number(row.popularity ?? 0), 0);
  const comparisonByBrand = new Map(comparisonRows.map((row) => [String(row.brand), Number(row.popularity ?? 0)]));
  return {
    available: rows.length > 0, source: 'Brand24 popularity index', latestSnapshot: latest,
    comparisonSnapshot: comparisonLatest,
    freshness: latest ? { latestReportDate: latest, states: ['rolling_30d'], ingestedAt: null } : null,
    range,
    methodology: 'Rolling 30-day popularity index for Indonesia. Share is each brand index divided by the selected comparison set total; it is not total-market share.',
    caveat: 'MG materially inflates the all-brand denominator, so the dashboard shows a second view excluding MG.',
    brands: rows.map((row) => {
      const popularity = Number(row.popularity ?? 0);
      const share = total ? popularity / total : null;
      const shareExMg = row.brand === 'MG' ? null : totalExMg ? popularity / totalExMg : null;
      const comparisonPopularity = comparisonByBrand.get(String(row.brand));
      const comparisonShare = comparisonPopularity !== undefined && comparisonTotal ? comparisonPopularity / comparisonTotal : null;
      const comparisonShareExMg = row.brand === 'MG' || comparisonPopularity === undefined || !comparisonTotalExMg ? null : comparisonPopularity / comparisonTotalExMg;
      return {
        ...row, popularity: n(row.popularity), share, shareExMg,
        comparisonPopularity: comparisonPopularity ?? null,
        comparisonShare, comparisonShareExMg,
        shareDelta: delta(share ?? undefined, comparisonShare ?? undefined),
        shareExMgDelta: delta(shareExMg ?? undefined, comparisonShareExMg ?? undefined),
      };
    }),
    mentions: mentions.map((row) => ({ brand: row.brand, mentions: n(row.mentions) })),
    trend: trend.map((row) => ({ date: dateKey(row.snapshot_date as string | Date), brand: row.brand, popularity: n(row.popularity) })),
  };
}

export async function getHealth() {
  const sql = getDb();
  const states = await sql`select * from source_state order by source`;
  const runs = await sql`select * from ingestion_run order by started_at desc limit 30`;
  const facts = await sql`
    select platform, account_id, max(report_date) as latest_report_date, max(ingested_at) as last_ingested_at,
      array_agg(distinct freshness) as freshness_states, count(*)::int as row_count
    from fact_daily group by platform, account_id order by platform
  `;
  const wacReporting = states.find((state) => state.source === 'wac_reporting')?.details ?? null;
  return { checkedAt: new Date().toISOString(), timezone: 'Asia/Jakarta', states, facts, recentRuns: runs, wacReporting };
}
