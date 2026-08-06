import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fail, readRange } from './_lib/http.js';
import { getSovBlock } from './_lib/repository.js';

const competitors = [
  { brand: 'Chery', model: 'Tiggo Cross CSH', startingPriceIdr: 329_800_000, powertrain: 'Hybrid', sourceUrl: 'https://chery.co.id/id/model/csh/tipe/tiggo-cross-csh-hybrid' },
  { brand: 'BYD', model: 'Atto 1', startingPriceIdr: 199_000_000, powertrain: 'EV', sourceUrl: 'https://prod.byd.com/id/pricelist' },
  { brand: 'Wuling', model: 'New Air ev', startingPriceIdr: 214_000_000, powertrain: 'EV', sourceUrl: 'https://wuling.id/id/daftar-harga/' },
  { brand: 'Geely', model: 'EX2 Pro', startingPriceIdr: 233_000_000, powertrain: 'EV', sourceUrl: 'https://stage.geelyauto.id/ex2' },
  { brand: 'MG', model: null, startingPriceIdr: null, powertrain: 'EV / Hybrid', sourceUrl: 'https://www.mgmotor.id/' },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const range = readRange(req);
    const sov = await getSovBlock(range);
    return res.status(200).json({
    checkedAt: '2026-08-03', market: 'Indonesia', pricingBasis: 'Official starting price, OTR Jakarta where stated',
    benchmark: { brand: 'JAECOO', model: 'J5 EV', startingPriceIdr: 319_900_000, sourceUrl: 'https://jaecoo.id/model/jaecoo-j5-ev' },
    competitors,
    sov: sov.brands,
    sovSnapshot: sov.latestSnapshot,
    dataPolicy: 'Unavailable official pricing is not replaced with an unofficial estimate.',
  });
  } catch (error) {
    return fail(res, error);
  }
}
