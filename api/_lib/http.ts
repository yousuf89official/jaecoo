import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveDateRange } from './date-range.js';

export function readRange(req: VercelRequest) {
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  return resolveDateRange({
    range: first(req.query.range), cmp: first(req.query.cmp),
    start: first(req.query.start), end: first(req.query.end),
  });
}

export function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Cache-Control', 'private, max-age=0, s-maxage=120, stale-while-revalidate=300');
  return res.status(status).json(body);
}

export function fail(res: VercelResponse, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const misconfigured = message.includes('DATABASE_URL');
  const invalid = /^(Invalid date|Unsupported range|Unsupported comparison|Custom range)/.test(message);
  if (!misconfigured && !invalid) console.error('Dashboard API failed', error instanceof Error ? error.name : 'unknown_error');
  return json(res, misconfigured ? 503 : invalid ? 400 : 500, {
    error: misconfigured ? 'database_not_configured' : invalid ? 'invalid_request' : 'data_service_error',
    message: misconfigured ? 'DATABASE_URL is not configured for this runtime.' : invalid ? message : 'The database-backed reporting service could not complete this request.',
    dataPolicy: 'Unavailable sources are never represented as zero.',
  });
}
