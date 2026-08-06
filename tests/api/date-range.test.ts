import { describe, expect, it } from 'vitest';
import { resolveDateRange } from '../../api/_lib/date-range.ts';

const now = new Date('2026-08-03T04:00:00Z');

describe('resolveDateRange', () => {
  it('resolves an inclusive 30 day window and previous period', () => {
    const result = resolveDateRange({ range: '30', cmp: 'prev', now });
    expect(result.current).toEqual({ start: '2026-07-05', end: '2026-08-03' });
    expect(result.comparison).toEqual({ start: '2026-06-05', end: '2026-07-04' });
    expect(result.days).toBe(30);
  });

  it('resolves MTD and YoY in Asia/Jakarta', () => {
    const result = resolveDateRange({ range: 'mtd', cmp: 'yoy', now });
    expect(result.current).toEqual({ start: '2026-08-01', end: '2026-08-03' });
    expect(result.comparison).toEqual({ start: '2025-08-01', end: '2025-08-03' });
  });

  it('uses monthly granularity for long ranges', () => {
    expect(resolveDateRange({ range: '180', now }).granularity).toBe('month');
  });

  it.each([7, 14, 30, 60, 90, 180])('resolves the inclusive %i-day preset', (days) => {
    expect(resolveDateRange({ range: String(days), cmp: 'none', now }).days).toBe(days);
  });

  it('resolves YTD and a valid custom YoY window', () => {
    expect(resolveDateRange({ range: 'ytd', cmp: 'none', now }).current).toEqual({ start: '2026-01-01', end: '2026-08-03' });
    const custom = resolveDateRange({ range: 'custom', cmp: 'yoy', start: '2026-02-28', end: '2026-03-02', now });
    expect(custom.comparison).toEqual({ start: '2025-02-28', end: '2025-03-02' });
  });

  it('rejects an invalid custom window', () => {
    expect(() => resolveDateRange({ range: 'custom', start: '2026-08-03', end: '2026-08-02', now })).toThrow();
  });
});
