export type NavKey = 'overview' | 'meta' | 'tiktok' | 'google' | 'sov' | 'competitors' | 'trends' | 'settings';
export type RangeKey = '7' | '14' | '30' | '60' | '90' | '180' | 'mtd' | 'ytd' | 'custom';
export type CompareKey = 'prev' | 'yoy' | 'none';

export interface RangeState {
  range: RangeKey;
  cmp: CompareKey;
  start?: string;
  end?: string;
}

export interface KpiDatum {
  metric: string;
  value: number | null;
  comparison: number | null;
  delta: number | null;
}

export interface PaidBlock {
  source: string;
  accountId: string;
  available: boolean;
  freshness: { latestReportDate: string; states: string[]; ingestedAt: string } | null;
  qaFlags: string[];
  kpis: KpiDatum[];
  series: Array<Record<string, string | number | undefined>>;
  campaigns: Array<Record<string, string | number | null>>;
  ads: Array<Record<string, string | number | null>>;
}

export interface ConnectionState {
  title: string;
  message: string;
  steps: readonly string[];
}

export interface SocialBlock {
  connected: boolean;
  profile: Record<string, unknown> | null;
  posts: Array<Record<string, unknown>>;
  connection: ConnectionState | null;
  organic: {
    available: boolean;
    source: string;
    freshness: { latestReportDate: string; states: string[]; ingestedAt: string | null } | null;
    totals: Record<string, number>;
    comparisonTotals: Record<string, number> | null;
    deltas: Record<string, number | null>;
    series: Array<Record<string, unknown>>;
    topPosts: Array<Record<string, unknown>>;
  };
}

export interface WebBlock {
  source: string;
  accountId: string;
  available: boolean;
  freshness: { latestReportDate: string; states: string[]; ingestedAt: string | null } | null;
  totals: Record<string, number>;
  comparisonTotals: Record<string, number> | null;
  deltas: Record<string, number | null>;
  series: Array<Record<string, string | number>>;
  breakdown: Array<{ type: string; label: string; metric: string; value: number | null }>;
}

export interface ApiErrorShape { error: string; message: string; dataPolicy?: string }
