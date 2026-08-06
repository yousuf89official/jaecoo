import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fail, readRange } from './_lib/http.js';
import { getSovBlock } from './_lib/repository.js';

const competitors = [
  { brand: 'Chery', model: 'Tiggo Cross CSH', powertrain: 'Hybrid' },
  { brand: 'BYD', model: 'Atto 1', powertrain: 'EV' },
  { brand: 'Wuling', model: 'New Air ev', powertrain: 'EV' },
  { brand: 'Geely', model: 'EX2 Pro', powertrain: 'EV' },
  { brand: 'MG', model: null, powertrain: 'EV / Hybrid' },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const range = readRange(req);
    const sov = await getSovBlock(range);
    return res.status(200).json({
    checkedAt: '2026-08-03', market: 'Indonesia',
    competitors,
    sov: sov.brands,
    sovSnapshot: sov.latestSnapshot,
    dataPolicy: 'Commercial and media cost fields are excluded from this dashboard.',
  });
  } catch (error) {
    return fail(res, error);
  }
}
