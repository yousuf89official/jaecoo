import type { RangeState } from '../types';

export function queryString(range: RangeState): string {
  const params = new URLSearchParams({ range: range.range, cmp: range.cmp });
  if (range.range === 'custom' && range.start && range.end) {
    params.set('start', range.start); params.set('end', range.end);
  }
  return params.toString();
}

export async function apiFetch<T>(path: string): Promise<T> {
  let requestPath = path;
  if (typeof location !== 'undefined' && location.pathname.startsWith('/client/') && /^\/api\/(overview|meta|tiktok|google|sov|competitors)(\?|$)/.test(path)) {
    const original = new URL(path, location.origin);
    const params = new URLSearchParams(original.search);
    params.set('view', original.pathname.replace(/^\/api\//, ''));
    requestPath = `/api/client/data?${params.toString()}`;
  }
  const response = await fetch(requestPath, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
  const body = await response.json().catch(() => ({ message: 'The API did not return JSON.' }));
  if (!response.ok) throw Object.assign(new Error(body.message ?? `Request failed (${response.status})`), { status: response.status, body });
  return body as T;
}
