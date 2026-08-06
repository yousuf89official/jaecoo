import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runIngestion } from '../ingestion/run.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.ADMIN_REFRESH_SECRET || req.headers.authorization !== `Bearer ${process.env.ADMIN_REFRESH_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try { return res.status(202).json({ ok: true, ...(await runIngestion({ days: 10 })) }); }
  catch (error) {
    console.error('Owner refresh failed', error instanceof Error ? error.name : 'unknown_error');
    return res.status(500).json({ ok: false, error: 'refresh_failed', message: 'The owner refresh failed. Review the protected health log.' });
  }
}
