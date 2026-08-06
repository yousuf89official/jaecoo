import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runIngestion } from '../../ingestion/run.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const expected = process.env.CRON_SECRET;
  const authorization = req.headers.authorization;
  const supplied = Array.isArray(req.headers['x-cron-secret']) ? req.headers['x-cron-secret'][0] : req.headers['x-cron-secret'];
  if (!expected || (authorization !== `Bearer ${expected}` && supplied !== expected)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!['GET', 'POST'].includes(req.method ?? '')) return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const result = await runIngestion({ days: 10 });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('Scheduled ingestion failed', error instanceof Error ? error.name : 'unknown_error');
    return res.status(500).json({ ok: false, error: 'ingestion_failed', message: 'The scheduled ingestion run failed. Review the protected health log.' });
  }
}
