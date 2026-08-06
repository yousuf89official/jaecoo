import { describe, expect, it } from 'vitest';
import { inferFunnelStage, valueUsed } from './normalize.ts';
import { extractPageSummary } from './wac-paid.ts';

describe('WAC normalization', () => {
  it('uses raw_value when normalized_value is null', () => {
    expect(valueUsed({
      platform: 'google', account_id: '2762824884', entity_type: 'account',
      report_date: '2026-07-14', metric: 'spend', raw_value: '1689.975396', normalized_value: null,
    })).toBe('1689.975396');
  });

  it('preserves an explicit normalized zero instead of falling back to raw', () => {
    expect(valueUsed({
      platform: 'tiktok', account_id: '7575077837867335696', entity_type: 'account',
      report_date: '2026-07-14', metric: 'clicks', raw_value: '12', normalized_value: 0,
    })).toBe(0);
  });

  it('infers funnel stages conservatively', () => {
    expect(inferFunnelStage('JAE-J8-META-ENGAGEMENT-ALWAYSON-MAY26Q2-ID-MOFU')).toBe('MoFu');
    expect(inferFunnelStage('IIMS - ToFu - Views')).toBe('ToFu');
    expect(inferFunnelStage('Kelapa Gading dealer lead')).toBe('BoFu');
  });

  it('extracts normalized WAC page-summary values for reconciliation', () => {
    expect(extractPageSummary({ page_summary: {
      spend: { raw_value: '1800', normalized_value: null },
      impressions: '296879',
      unsupported_metric: 42,
    } })).toEqual({ spend: 1800, impressions: 296879 });
  });
});
