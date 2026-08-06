import { describe, expect, it } from 'vitest';
import { evaluateRemoteSnapshot } from './verify-remote.ts';

const now = new Date('2026-08-04T06:00:00Z');
const recent = '2026-08-04T03:30:00Z';
const paid = (accountId: string, google = false) => ({
  accountId, available: true, freshness: { latestReportDate: '2026-08-03' },
  kpis: [{ metric: 'impressions', value: 1 }], qaFlags: [],
});

function fixture() {
  const steps = ['one', 'two', 'three'];
  return {
    overview: { range: { timezone: 'Asia/Jakarta', current: { start: '2026-07-06', end: '2026-08-04' } }, paid: {
      meta: paid('act_1372413011147906'), tiktok: paid('7575077837867335696'), google: paid('2762824884', true),
    } },
    meta: { instagram: { connected: false, connection: { steps } }, facebook: { connected: false, connection: { steps } } },
    tiktok: { tiktok: { connected: false, connection: { steps } } },
    google: { paid: paid('2762824884', true), gsc: { available: true }, ga4: { available: true } },
    sov: { latestSnapshot: '2026-08-04', brands: ['Jaecoo','Chery','BYD','Wuling','Geely','MG'].map((brand) => ({ brand, popularity: 1 })) },
    competitors: { sov: ['Jaecoo','Chery','BYD','Wuling','Geely','MG'].map((brand) => ({ brand })) },
    health: {
      states: ['meta','tiktok','google'].map((platform) => ({ source: `${platform}_paid`, details: { reconciliation: { status: 'reconciled' } } })),
      facts: Object.entries({ meta:'act_1372413011147906',tiktok:'7575077837867335696',google:'2762824884' }).map(([platform, account_id]) => ({ platform, account_id, row_count: 1 })),
      recentRuns: [...['meta','tiktok','google'].map((platform) => ({ source: `wac:${platform}`, status: 'complete', finished_at: recent })), { source: 'wac_reporting_health', status: 'complete', finished_at: recent }],
      wacReporting: { accounts: [] },
    },
  };
}

describe('remote readiness evaluation', () => {
  it('accepts a reconciled, fresh, database-backed deployment while organic remains honestly disconnected', () => {
    expect(evaluateRemoteSnapshot({ ...fixture(), now })).toEqual({ ok: true, issues: [] });
  });

  it('fails closed for missing paid coverage and stale cron evidence', () => {
    const value = fixture();
    value.overview.paid.meta.available = false;
    value.health.recentRuns = [];
    const result = evaluateRemoteSnapshot({ ...value, now });
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('meta paid facts are unavailable after backfill.');
    expect(result.issues.some((issue) => issue.includes('successful ingestion run'))).toBe(true);
  });
});
