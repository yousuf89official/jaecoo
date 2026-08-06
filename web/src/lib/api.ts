import type { RangeState } from '../types';

export function queryString(range: RangeState): string {
  const params = new URLSearchParams({ range: range.range, cmp: range.cmp });
  if (range.range === 'custom' && range.start && range.end) {
    params.set('start', range.start); params.set('end', range.end);
  }
  return params.toString();
}

export async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { Accept: 'application/json' } });
  const body = await response.json().catch(() => ({ message: 'The API did not return JSON.' }));
  if (!response.ok) throw Object.assign(new Error(body.message ?? `Request failed (${response.status})`), { status: response.status, body });
  return body as T;
}
