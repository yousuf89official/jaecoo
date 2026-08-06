export function formatNumber(value: number | null | undefined, options: Intl.NumberFormatOptions = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Unavailable';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, ...options }).format(value);
}

export function formatCompact(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Unavailable';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatIdr(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Unavailable';
  const abs = Math.abs(value);
  const units = abs >= 1_000_000_000 ? [1_000_000_000, 'B'] as const
    : abs >= 1_000_000 ? [1_000_000, 'M'] as const
      : abs >= 1_000 ? [1_000, 'K'] as const : [1, ''] as const;
  return `Rp${(value / units[0]).toLocaleString('en-US', { maximumFractionDigits: units[1] ? 1 : 0 })}${units[1]}`;
}

export function formatPercent(value: number | null | undefined, fraction = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Unavailable';
  return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: fraction }).format(value);
}

export function formatMetric(metric: string, value: number | null | undefined) {
  if (metric === 'spend' || metric === 'cpm' || metric === 'conversion_value') return formatIdr(value);
  if (metric === 'ctr' || metric.includes('rate')) return formatPercent(value);
  return formatCompact(value);
}

export function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
