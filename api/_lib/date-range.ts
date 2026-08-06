export type RangePreset = '7' | '14' | '30' | '60' | '90' | '180' | 'mtd' | 'ytd' | 'custom';
export type ComparisonMode = 'prev' | 'yoy' | 'none';

export interface DateWindow { start: string; end: string }
export interface ResolvedRange {
  preset: RangePreset;
  comparisonMode: ComparisonMode;
  current: DateWindow;
  comparison: DateWindow | null;
  days: number;
  granularity: 'day' | 'month';
  timezone: 'Asia/Jakarta';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string): Date {
  if (!DATE_RE.test(value)) throw new Error(`Invalid date: ${value}`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid date: ${value}`);
  }
  return parsed;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function shiftYear(value: string, years: number): string {
  const date = parseDate(value);
  const month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() + years);
  if (date.getUTCMonth() !== month) date.setUTCDate(0);
  return formatDate(date);
}

function todayInJakarta(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function inclusiveDays(window: DateWindow): number {
  return Math.floor((parseDate(window.end).valueOf() - parseDate(window.start).valueOf()) / 86_400_000) + 1;
}

export function resolveDateRange(input: {
  range?: string;
  cmp?: string;
  start?: string;
  end?: string;
  now?: Date;
}): ResolvedRange {
  const preset = (input.range?.toLowerCase() ?? '30') as RangePreset;
  const validPresets: RangePreset[] = ['7', '14', '30', '60', '90', '180', 'mtd', 'ytd', 'custom'];
  if (!validPresets.includes(preset)) throw new Error(`Unsupported range: ${input.range}`);
  const comparisonMode = (input.cmp?.toLowerCase() ?? 'prev') as ComparisonMode;
  if (!['prev', 'yoy', 'none'].includes(comparisonMode)) throw new Error(`Unsupported comparison: ${input.cmp}`);

  const today = todayInJakarta(input.now);
  let current: DateWindow;
  if (/^\d+$/.test(preset)) {
    current = { start: shiftDays(today, -(Number(preset) - 1)), end: today };
  } else if (preset === 'mtd') {
    current = { start: `${today.slice(0, 7)}-01`, end: today };
  } else if (preset === 'ytd') {
    current = { start: `${today.slice(0, 4)}-01-01`, end: today };
  } else {
    if (!input.start || !input.end) throw new Error('Custom range requires start and end dates');
    parseDate(input.start); parseDate(input.end);
    if (input.start > input.end) throw new Error('Custom range start must be on or before end');
    if (input.end > today) throw new Error('Custom range cannot end in the future');
    current = { start: input.start, end: input.end };
  }

  const days = inclusiveDays(current);
  const comparison = comparisonMode === 'none' ? null
    : comparisonMode === 'yoy'
      ? { start: shiftYear(current.start, -1), end: shiftYear(current.end, -1) }
      : { start: shiftDays(current.start, -days), end: shiftDays(current.start, -1) };

  return {
    preset, comparisonMode, current, comparison, days,
    granularity: days <= 62 ? 'day' : 'month',
    timezone: 'Asia/Jakarta',
  };
}
