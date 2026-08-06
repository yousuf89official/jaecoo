import { describe, expect, it } from 'vitest';
import { aggregateOrganic, aggregateWeb } from '../../api/_lib/repository.ts';

describe('repository aggregation', () => {
  it('weights GSC position and derives CTR instead of summing rates', () => {
    const result = aggregateWeb([
      { report_date: '2026-08-01', dimension_type: '', metric: 'clicks', value: 10 },
      { report_date: '2026-08-01', dimension_type: '', metric: 'impressions', value: 100 },
      { report_date: '2026-08-01', dimension_type: '', metric: 'ctr', value: 0.1 },
      { report_date: '2026-08-01', dimension_type: '', metric: 'position', value: 2 },
      { report_date: '2026-08-02', dimension_type: '', metric: 'clicks', value: 10 },
      { report_date: '2026-08-02', dimension_type: '', metric: 'impressions', value: 300 },
      { report_date: '2026-08-02', dimension_type: '', metric: 'ctr', value: 1 / 30 },
      { report_date: '2026-08-02', dimension_type: '', metric: 'position', value: 6 },
    ], 'gsc', 'month');
    expect(result.totals.clicks).toBe(20);
    expect(result.totals.impressions).toBe(400);
    expect(result.totals.ctr).toBe(0.05);
    expect(result.totals.position).toBe(5);
    expect(result.series).toHaveLength(1);
  });

  it('computes follower change while summing organic delivery', () => {
    const result = aggregateOrganic([
      { report_date: '2026-08-01', metric: 'follower_count', value: 100 },
      { report_date: '2026-08-02', metric: 'follower_count', value: 112 },
      { report_date: '2026-08-01', metric: 'reach', value: 30 },
      { report_date: '2026-08-02', metric: 'reach', value: 45 },
    ]);
    expect(result.followers_growth).toBe(12);
    expect(result.reach).toBe(75);
  });
});
